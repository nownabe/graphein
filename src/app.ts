import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { logger } from "hono/logger";
import { getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { createCsrfMiddleware } from "./auth/csrf";
import { createAuthMiddleware } from "./auth/middleware";
import { createAuthRoutes } from "./auth/routes.tsx";
import { createTaskRoutes } from "./tasks/routes.tsx";
import { createAdminRoutes } from "./admin/routes.tsx";
import { createSnippetRoutes } from "./snippets/routes.tsx";
import { clickjackingMiddleware } from "./auth/clickjacking";
import type { HonoAppConfig } from "./config";

export function createHonoApp(config: HonoAppConfig) {
  const { session, userService, taskService, snippetService, buildMrkdwnLabels } = config;

  const csrfMw = createCsrfMiddleware(config.baseUrl);

  const { authMiddleware, adminMiddleware } = createAuthMiddleware(
    session.verifyToken,
    userService.isAdmin,
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
    devMode: config.devMode,
  });

  const snippetRoutes = createSnippetRoutes({
    authMiddleware,
    snippetService,
    userService,
    buildMrkdwnLabels: config.buildMrkdwnLabels,
    timezone: config.timezone,
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

  // Task routes (includes home page)
  app.route("/", taskRoutes);

  return app;
}
