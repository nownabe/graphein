import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { logger } from "hono/logger";
import { getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { contextStorage } from "hono/context-storage";
import { mcpAuthRouter, StreamableHTTPTransport } from "@hono/mcp";
import { wellKnownRouter } from "@hono/mcp/auth";
import { createCsrfMiddleware } from "./adapters/middleware/csrf";
import { createAuthMiddleware } from "./application/auth/middleware";
import { createAuthRoutes } from "./adapters/web/auth/routes.tsx";
import { createTaskRoutes } from "./adapters/web/tasks/routes.tsx";
import { createAdminRoutes } from "./adapters/web/admin/routes.tsx";
import { createSnippetRoutes } from "./adapters/web/snippets/routes.tsx";
import { createKudosRoutes } from "./adapters/web/kudos/routes.tsx";
import { createApiKeyRoutes } from "./adapters/web/api-keys/routes.tsx";
import { clickjackingMiddleware } from "./adapters/middleware/clickjacking";
import {
  createApiMiddleware,
  createRateLimiter,
  extractBearerToken,
} from "./adapters/api/middleware";
import { createApiRoutes } from "./adapters/api/routes";
import { GrapheinOAuthProvider } from "./adapters/mcp/auth-provider";
import { createMcpServer } from "./adapters/mcp/server";
import "./adapters/mcp/types"; // Side-effect import for ContextVariableMap augmentation
import type { HonoAppConfig } from "./config";

export function createHonoApp(config: HonoAppConfig) {
  const {
    session,
    userService,
    taskService,
    snippetService,
    usergroupService,
    kudosService,
    settingsService,
    apiKeyService,
    oauthService,
    jwtSecret,
    buildMrkdwnLabels,
  } = config;

  const csrfMw = createCsrfMiddleware(config.baseUrl);

  const { authMiddleware, adminMiddleware } = createAuthMiddleware(
    session.verifyToken,
    async (userId) => {
      const user = await userService.findUserById(userId);
      return { isAdmin: user?.role === "admin", avatarUrl: user?.avatarUrl ?? null };
    },
  );

  const authRoutes = createAuthRoutes(
    {
      baseUrl: config.baseUrl,
      slackClientId: config.slackClientId,
      slackClientSecret: config.slackClientSecret,
      slackTeamId: config.slackTeamId,
    },
    session,
    userService,
    config.devMode,
  );

  const taskRoutes = createTaskRoutes({
    authMiddleware,
    taskService,
    userService,
    buildMrkdwnLabels,
    devMode: config.devMode,
  });

  const adminRoutes = createAdminRoutes({
    authMiddleware,
    adminMiddleware,
    userService,
    snippetService,
    kudosService,
    settingsService,
    resolveChannelName: config.resolveChannelName,
    devMode: config.devMode,
  });

  const snippetRoutes = createSnippetRoutes({
    authMiddleware,
    snippetService,
    usergroupService,
    userService,
    settingsService,
    buildMrkdwnLabels: config.buildMrkdwnLabels,
    timezone: config.timezone,
    devMode: config.devMode,
  });

  const kudosRoutes = createKudosRoutes({
    authMiddleware,
    kudosService,
    settingsService,
    buildMrkdwnLabels: config.buildMrkdwnLabels,
    timezone: config.timezone,
    devMode: config.devMode,
  });

  const apiKeyRoutes = createApiKeyRoutes({
    authMiddleware,
    apiKeyService,
    devMode: config.devMode,
  });

  // Build the Hono app
  const app = new Hono();

  app.use("*", logger());
  app.use("/public/*", serveStatic({ root: "./" }));

  // Anti-clickjacking: prevent framing by any origin
  app.use("*", clickjackingMiddleware);

  // CSRF protection for all state-changing requests
  app.use("*", csrfMw);

  // API auth + rate limiting for /api/v1/* (excluding doc and reference)
  const { authMiddleware: apiAuth, rateLimitMiddleware: apiRateLimit } = createApiMiddleware(
    apiKeyService,
    config.cache,
  );
  const isApiDocPath = (url: string) => {
    const path = new URL(url).pathname;
    return path === "/api/v1/doc" || path === "/api/v1/reference";
  };
  app.use("/api/v1/*", async (c, next) => {
    if (isApiDocPath(c.req.url)) return next();
    return apiAuth(c, next);
  });
  app.use("/api/v1/*", async (c, next) => {
    if (isApiDocPath(c.req.url)) return next();
    return apiRateLimit(c, next);
  });

  // API routes (OpenAPIHono sub-app)
  const apiRoutes = createApiRoutes({
    taskService,
    userService,
    snippetService,
    kudosService,
    db: config.db,
  });
  app.route("/api/v1", apiRoutes);

  app.get("/healthz", (c) => c.text("ok"));

  // Locale switching
  app.post("/locale/:lang", async (c) => {
    const lang = c.req.param("lang");
    const locale = lang === "ja" ? "ja" : "en";
    setCookie(c, "locale", locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "Lax",
    });

    // Persist locale to DB if user is logged in
    const token = getCookie(c, "token");
    if (token) {
      const payload = await session.verifyToken(token);
      if (payload) {
        await userService.updateUserLocale(payload.sub, locale);
      }
    }

    // htmx request — return 200 so the client can do a full page reload
    if (c.req.header("HX-Request")) {
      c.header("HX-Refresh", "true");
      return c.body(null, 200);
    }
    return c.redirect("/tasks", 302);
  });

  // Theme switching
  app.post("/theme/:mode", async (c) => {
    const mode = c.req.param("mode");
    const theme = mode === "light" ? "light" : "dark";
    setCookie(c, "theme", theme, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "Lax",
    });

    const token = getCookie(c, "token");
    if (token) {
      const payload = await session.verifyToken(token);
      if (payload) {
        await userService.updateUserTheme(payload.sub, theme);
      }
    }

    return c.body(null, 200);
  });

  // Dev hot reload SSE endpoint
  if (config.devMode) {
    app.get("/dev/reload", (c) => {
      return streamSSE(c, async (stream) => {
        while (true) {
          await stream.writeSSE({ data: "ping", event: "ping" });
          await stream.sleep(1000);
        }
      });
    });
  } else {
    app.get("/dev/reload", (c) => c.notFound());
  }

  // Auth routes
  app.route("/auth", authRoutes);

  // OAuth consent endpoint for MCP authorization flow
  const oauthProvider = new GrapheinOAuthProvider(
    oauthService,
    userService,
    session,
    config.baseUrl,
    jwtSecret,
    config.devMode,
  );
  app.post("/oauth/consent", (c) => oauthProvider.handleConsent(c));

  // OAuth Authorization Server endpoints (discovery, registration, token, revocation)
  // mcpAuthRouter is mounted at /oauth so endpoints are /oauth/authorize, /oauth/token, etc.
  // as defined in the design doc. The .well-known discovery routes are mounted separately
  // at / because they must be at /.well-known/* (not /oauth/.well-known/*).
  //
  // Cast provider because @hono/mcp passes Hono Context (not express Response) to
  // authorize() at runtime, but the SDK type declares express.Response. The cast is safe.
  app.route(
    "/oauth",
    mcpAuthRouter({
      provider: oauthProvider as unknown as Parameters<typeof mcpAuthRouter>[0]["provider"],
      issuerUrl: config.baseUrl,
      resourceServerUrl: new URL(`${config.baseUrl}/mcp`),
      scopesSupported: ["graphein"],
      serviceDocumentationUrl: new URL(`${config.baseUrl}/api/v1/reference`),
    }),
  );

  // OAuth discovery endpoints (RFC 8414 / RFC 9728)
  // Mounted separately at / so they live at /.well-known/* (not /oauth/.well-known/*).
  // Metadata URLs use /oauth/* prefix to match the actual route paths above.
  const oauthMetadata = {
    issuer: config.baseUrl,
    authorization_endpoint: `${config.baseUrl}/oauth/authorize`,
    token_endpoint: `${config.baseUrl}/oauth/token`,
    registration_endpoint: `${config.baseUrl}/oauth/register`,
    revocation_endpoint: `${config.baseUrl}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["graphein"],
    service_documentation: `${config.baseUrl}/api/v1/reference`,
  };
  app.route(
    "/",
    wellKnownRouter({
      oauthMetadata,
      resourceServerUrl: new URL(`${config.baseUrl}/mcp`),
      scopesSupported: ["graphein"],
      serviceDocumentationUrl: new URL(`${config.baseUrl}/api/v1/reference`),
    }),
  );

  // MCP Streamable HTTP endpoint
  //
  // A new McpServer + StreamableHTTPTransport is created per request.
  // The MCP SDK ties a single McpServer instance to one transport at a
  // time, so sharing an instance across concurrent requests is unsafe.
  // Since Graphein runs in stateless mode (no sessions, no subscriptions),
  // per-request instantiation is the correct approach.
  const mcpRateLimiter = createRateLimiter(config.cache);
  app.use("/mcp", contextStorage());
  const mcpResourceUrl = `${config.baseUrl}/mcp`;
  app.all("/mcp", async (c) => {
    // Verify Bearer token (JWT access token) — case-insensitive scheme per RFC 9110 §11.1
    const token = extractBearerToken(c.req.header("Authorization"));
    if (!token) {
      return c.json({}, 401, {
        "WWW-Authenticate": `Bearer resource_metadata="${config.baseUrl}/.well-known/oauth-protected-resource/mcp"`,
      });
    }

    let tokenInfo: Awaited<ReturnType<typeof oauthProvider.verifyAccessToken>>;
    try {
      tokenInfo = await oauthProvider.verifyAccessToken(token);
    } catch {
      return c.json({}, 401, {
        "WWW-Authenticate": `Bearer resource_metadata="${config.baseUrl}/.well-known/oauth-protected-resource/mcp"`,
      });
    }

    // Validate audience — reject tokens minted for a different resource
    if (tokenInfo.resource?.toString() !== mcpResourceUrl) {
      return c.json({}, 401, {
        "WWW-Authenticate": `Bearer resource_metadata="${config.baseUrl}/.well-known/oauth-protected-resource/mcp"`,
      });
    }

    // Validate scope — require the "graphein" scope
    if (!tokenInfo.scopes.includes("graphein")) {
      return c.json({}, 403, {
        "WWW-Authenticate": `Bearer error="insufficient_scope", scope="graphein"`,
      });
    }

    // Rate limiting keyed by user ID (60 req/min)
    const userId = (tokenInfo.extra as { sub: string }).sub;
    const { remaining, resetAt } = await mcpRateLimiter.check(userId);
    const resetAtSeconds = Math.ceil(resetAt / 1000);
    if (remaining < 0) {
      const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
      c.header("Retry-After", String(retryAfter));
      c.header("X-RateLimit-Limit", "60");
      c.header("X-RateLimit-Remaining", "0");
      c.header("X-RateLimit-Reset", String(resetAtSeconds));
      return c.json(
        {
          error: { code: "rate_limited", message: "Rate limit exceeded. Try again later." },
        },
        429,
      );
    }
    c.header("X-RateLimit-Limit", "60");
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(resetAtSeconds));

    // Look up user for tool/resource handlers
    const user = await userService.findUserById(userId);
    if (!user) {
      return c.json({}, 401, {
        "WWW-Authenticate": `Bearer resource_metadata="${config.baseUrl}/.well-known/oauth-protected-resource/mcp"`,
      });
    }

    // Set user context for tool/resource handlers (accessible via getContext())
    c.set("mcpUser", user);
    c.set("mcpRole", user.role);

    // Per-request server + transport (stateless mode)
    const mcpServer = createMcpServer({
      name: "graphein",
      version: "1.0.0",
      db: config.db,
      taskService,
      userService,
      snippetService,
      kudosService,
    });
    const transport = new StreamableHTTPTransport();
    await mcpServer.connect(transport);
    return transport.handleRequest(c);
  });

  // Slack events/interactions (HTTP mode only, not used in Socket Mode)
  if (config.slackReceiver) {
    const r = config.slackReceiver;
    app.post("/slack/events", (c) => r.handleRequest(c));
    app.post("/slack/interactions", (c) => r.handleRequest(c));
  }

  // Admin routes
  app.route("/", adminRoutes);

  // Snippet routes
  app.route("/", snippetRoutes);

  // Kudos routes
  app.route("/", kudosRoutes);

  // API key routes
  app.route("/", apiKeyRoutes);

  // Task routes (includes home page)
  app.route("/", taskRoutes);

  return app;
}
