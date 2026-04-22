import { describe, test, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { sign, verify } from "hono/jwt";
import { GrapheinOAuthProvider } from "./auth-provider";
import type { OAuthService } from "../oauth/service";
import type { SessionHelpers } from "../auth/session";

const MCP_JWT_SECRET = "test-mcp-jwt-secret";
const BASE_URL = "https://graphein.example.com";

function createMockOAuthService(overrides: Partial<OAuthService> = {}): OAuthService {
  return {
    registerClient: async () => ({
      clientId: "new-client",
      clientSecret: "secret",
      clientName: "Test",
      redirectUris: [],
      grantTypes: [],
      id: "uuid",
      clientSecretHash: null,
      createdAt: new Date(),
    }),
    getClient: async () => undefined,
    createAuthorizationCode: async () => "test-code",
    consumeAuthorizationCode: async () => null,
    getCodeChallenge: async () => null,
    createRefreshToken: async () => "refresh-token",
    consumeRefreshToken: async () => null,
    revokeRefreshToken: async () => {},
    cleanupExpired: async () => {},
    ...overrides,
  } as unknown as OAuthService;
}

const ACTIVE_USER = {
  id: "user-uuid",
  slackUserId: "U123",
  email: "test@example.com",
  displayName: "Test User",
  avatarUrl: null,
  role: "user",
  locale: "en",
  deactivatedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createMockUserService(overrides: Record<string, any> = {}) {
  return {
    isDeactivated: async () => false,
    findUserById: async () => ACTIVE_USER,
    findOrCreateUser: async () => ({}),
    isAdmin: async () => false,
    listAllUsers: async () => [],
    ...overrides,
  } as any;
}

function createMockSession(overrides: Partial<SessionHelpers> = {}): SessionHelpers {
  return {
    createToken: async () => "token",
    verifyToken: async () => null,
    ...overrides,
  };
}

describe("GrapheinOAuthProvider", () => {
  let provider: GrapheinOAuthProvider;
  let mockOAuthService: OAuthService;
  let mockSession: SessionHelpers;

  beforeEach(() => {
    mockOAuthService = createMockOAuthService();
    mockSession = createMockSession();
    provider = new GrapheinOAuthProvider(
      mockOAuthService,
      createMockUserService(),
      mockSession,
      BASE_URL,
      MCP_JWT_SECRET,
    );
  });

  describe("clientsStore", () => {
    test("getClient returns undefined for unknown client", async () => {
      const result = await provider.clientsStore.getClient("unknown");
      expect(result).toBeUndefined();
    });

    test("getClient returns formatted client info", async () => {
      mockOAuthService = createMockOAuthService({
        getClient: async () => ({
          id: "uuid",
          clientId: "my-client",
          clientName: "My Client",
          clientSecretHash: null,
          redirectUris: ["https://example.com/callback"],
          grantTypes: ["authorization_code"],
          createdAt: new Date(),
        }),
      });
      provider = new GrapheinOAuthProvider(
        mockOAuthService,
        createMockUserService(),
        mockSession,
        BASE_URL,
        MCP_JWT_SECRET,
      );

      const result = await provider.clientsStore.getClient("my-client");
      expect(result).toBeDefined();
      expect(result!.client_id).toBe("my-client");
      expect(result!.client_name).toBe("My Client");
      expect(result!.token_endpoint_auth_method).toBe("none");
    });

    test("registerClient delegates to oauth service", async () => {
      const result = await provider.clientsStore.registerClient!({
        client_name: "New Client",
        redirect_uris: ["https://example.com/cb"],
        grant_types: ["authorization_code"],
        token_endpoint_auth_method: "none",
      } as any);
      expect(result.client_id).toBe("new-client");
      expect(result.client_secret).toBe("secret");
    });
  });

  describe("authorize", () => {
    test("redirects to login when no session", async () => {
      const app = new Hono();
      app.get("/test", async (c) => {
        await provider.authorize(
          { client_id: "test-client", redirect_uris: ["https://example.com/cb"] } as any,
          {
            redirectUri: "https://example.com/cb",
            codeChallenge: "challenge",
            state: "state123",
            scopes: ["graphein"],
          },
          c,
        );
        return c.res;
      });

      const res = await app.request("/test", { headers: {} });
      expect(res.status).toBe(302);
      const location = res.headers.get("Location")!;
      expect(location).toContain("/auth/slack");
      expect(location).toContain("return_to=");
    });

    test("shows consent page with POST forms when user is authenticated", async () => {
      mockSession = createMockSession({
        verifyToken: async () => ({ sub: "user-uuid", name: "Test User", exp: 9999999999 }),
      });
      provider = new GrapheinOAuthProvider(
        mockOAuthService,
        createMockUserService(),
        mockSession,
        BASE_URL,
        MCP_JWT_SECRET,
      );

      const app = new Hono();
      app.get("/test", async (c) => {
        await provider.authorize(
          {
            client_id: "test-client",
            client_name: "My MCP App",
            redirect_uris: ["https://example.com/cb"],
          } as any,
          {
            redirectUri: "https://example.com/cb",
            codeChallenge: "challenge",
            state: "state123",
            scopes: ["graphein"],
            resource: new URL("https://graphein.example.com/mcp"),
          },
          c,
        );
        return c.res;
      });

      const res = await app.request("/test", {
        headers: { Cookie: "token=valid-jwt" },
      });
      expect(res.status).toBe(200);
      const html = await res.text();
      // Client name displayed
      expect(html).toContain("My MCP App");
      // i18n button labels (en locale)
      expect(html).toContain("Approve");
      expect(html).toContain("Deny");
      // Redirect URI displayed
      expect(html).toContain("https://example.com/cb");
      // Consent forms must POST to /oauth/consent (CSRF-protected)
      // hx-boost="false" ensures full-page navigation for OAuth redirects
      expect(html).toContain('method="post" action="/oauth/consent" hx-boost="false"');
      expect(html).toContain('name="decision" value="approve"');
      expect(html).toContain('name="decision" value="deny"');
      // Auth params are in a signed request_token, not as individual hidden fields
      expect(html).toContain('name="request_token"');
      expect(html).not.toContain('name="client_id"');
      expect(html).not.toContain('name="redirect_uri"');
      expect(html).not.toContain('name="code_challenge"');
      // Must not contain GET-based consent params
      expect(html).not.toContain("consent=approved");
      // Uses Layout (has DOCTYPE, stylesheets)
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("styles.css");
    });

    test("renders consent page in Japanese when locale cookie is ja", async () => {
      mockSession = createMockSession({
        verifyToken: async () => ({ sub: "user-uuid", name: "Test User", exp: 9999999999 }),
      });
      provider = new GrapheinOAuthProvider(
        mockOAuthService,
        createMockUserService(),
        mockSession,
        BASE_URL,
        MCP_JWT_SECRET,
      );

      const app = new Hono();
      app.get("/test", async (c) => {
        await provider.authorize(
          {
            client_id: "test-client",
            client_name: "My MCP App",
            redirect_uris: ["https://example.com/cb"],
          } as any,
          {
            redirectUri: "https://example.com/cb",
            codeChallenge: "challenge",
            state: "state123",
            scopes: ["graphein"],
            resource: new URL("https://graphein.example.com/mcp"),
          },
          c,
        );
        return c.res;
      });

      const res = await app.request("/test", {
        headers: { Cookie: "token=valid-jwt; locale=ja" },
      });
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("My MCP App");
      expect(html).toContain('lang="ja"');
      expect(html).toContain("許可する");
      expect(html).toContain("拒否する");
    });
  });

  describe("handleConsent", () => {
    function buildFormBody(fields: Record<string, string>): string {
      return Object.entries(fields)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");
    }

    async function createRequestToken(overrides: Record<string, unknown> = {}): Promise<string> {
      const now = Math.floor(Date.now() / 1000);
      return sign(
        {
          typ: "consent_req",
          client_id: "test-client",
          redirect_uri: "https://example.com/cb",
          code_challenge: "challenge",
          state: "state123",
          scope: "graphein",
          resource: "https://graphein.example.com/mcp",
          exp: now + 600,
          iat: now,
          ...overrides,
        },
        MCP_JWT_SECRET,
        "HS256",
      );
    }

    test("generates code and redirects on approve", async () => {
      mockSession = createMockSession({
        verifyToken: async () => ({ sub: "user-uuid", name: "Test User", exp: 9999999999 }),
      });
      mockOAuthService = createMockOAuthService({
        createAuthorizationCode: async () => "auth-code-123",
      });
      provider = new GrapheinOAuthProvider(
        mockOAuthService,
        createMockUserService(),
        mockSession,
        BASE_URL,
        MCP_JWT_SECRET,
      );

      const app = new Hono();
      app.post("/oauth/consent", (c) => provider.handleConsent(c));

      const requestToken = await createRequestToken();
      const res = await app.request("/oauth/consent", {
        method: "POST",
        headers: {
          Cookie: "token=valid-jwt",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: buildFormBody({
          decision: "approve",
          request_token: requestToken,
        }),
      });
      expect(res.status).toBe(302);
      const location = res.headers.get("Location")!;
      expect(location).toContain("https://example.com/cb");
      expect(location).toContain("code=auth-code-123");
      expect(location).toContain("state=state123");
    });

    test("redirects with error on deny", async () => {
      mockSession = createMockSession({
        verifyToken: async () => ({ sub: "user-uuid", name: "Test User", exp: 9999999999 }),
      });
      provider = new GrapheinOAuthProvider(
        mockOAuthService,
        createMockUserService(),
        mockSession,
        BASE_URL,
        MCP_JWT_SECRET,
      );

      const app = new Hono();
      app.post("/oauth/consent", (c) => provider.handleConsent(c));

      const requestToken = await createRequestToken();
      const res = await app.request("/oauth/consent", {
        method: "POST",
        headers: {
          Cookie: "token=valid-jwt",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: buildFormBody({
          decision: "deny",
          request_token: requestToken,
        }),
      });
      expect(res.status).toBe(302);
      const location = res.headers.get("Location")!;
      expect(location).toContain("error=access_denied");
      expect(location).toContain("state=state123");
    });

    test("returns 401 without session", async () => {
      const app = new Hono();
      app.post("/oauth/consent", (c) => provider.handleConsent(c));

      const requestToken = await createRequestToken();
      const res = await app.request("/oauth/consent", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: buildFormBody({
          decision: "approve",
          request_token: requestToken,
        }),
      });
      expect(res.status).toBe(401);
    });

    test("returns 400 for missing request_token", async () => {
      mockSession = createMockSession({
        verifyToken: async () => ({ sub: "user-uuid", name: "Test User", exp: 9999999999 }),
      });
      provider = new GrapheinOAuthProvider(
        mockOAuthService,
        createMockUserService(),
        mockSession,
        BASE_URL,
        MCP_JWT_SECRET,
      );

      const app = new Hono();
      app.post("/oauth/consent", (c) => provider.handleConsent(c));

      const res = await app.request("/oauth/consent", {
        method: "POST",
        headers: {
          Cookie: "token=valid-jwt",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: buildFormBody({ decision: "approve" }),
      });
      expect(res.status).toBe(400);
    });

    test("returns 400 for tampered request_token", async () => {
      mockSession = createMockSession({
        verifyToken: async () => ({ sub: "user-uuid", name: "Test User", exp: 9999999999 }),
      });
      provider = new GrapheinOAuthProvider(
        mockOAuthService,
        createMockUserService(),
        mockSession,
        BASE_URL,
        MCP_JWT_SECRET,
      );

      const app = new Hono();
      app.post("/oauth/consent", (c) => provider.handleConsent(c));

      // Sign with wrong secret to simulate tampering
      const tamperedToken = await sign(
        { typ: "consent_req", client_id: "evil", redirect_uri: "https://evil.com/cb" },
        "wrong-secret",
        "HS256",
      );
      const res = await app.request("/oauth/consent", {
        method: "POST",
        headers: {
          Cookie: "token=valid-jwt",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: buildFormBody({ decision: "approve", request_token: tamperedToken }),
      });
      expect(res.status).toBe(400);
    });

    test("returns 400 for invalid decision", async () => {
      mockSession = createMockSession({
        verifyToken: async () => ({ sub: "user-uuid", name: "Test User", exp: 9999999999 }),
      });
      provider = new GrapheinOAuthProvider(
        mockOAuthService,
        createMockUserService(),
        mockSession,
        BASE_URL,
        MCP_JWT_SECRET,
      );

      const app = new Hono();
      app.post("/oauth/consent", (c) => provider.handleConsent(c));

      const requestToken = await createRequestToken();
      const res = await app.request("/oauth/consent", {
        method: "POST",
        headers: {
          Cookie: "token=valid-jwt",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: buildFormBody({ decision: "maybe", request_token: requestToken }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("challengeForAuthorizationCode", () => {
    test("returns code challenge", async () => {
      mockOAuthService = createMockOAuthService({
        getCodeChallenge: async () => ({
          codeChallenge: "the-challenge",
          codeChallengeMethod: "S256",
        }),
      });
      provider = new GrapheinOAuthProvider(
        mockOAuthService,
        createMockUserService(),
        mockSession,
        BASE_URL,
        MCP_JWT_SECRET,
      );

      const result = await provider.challengeForAuthorizationCode({} as any, "code123");
      expect(result).toBe("the-challenge");
    });

    test("throws when code not found", async () => {
      await expect(provider.challengeForAuthorizationCode({} as any, "bad-code")).rejects.toThrow(
        "Authorization code not found",
      );
    });
  });

  describe("exchangeAuthorizationCode", () => {
    test("issues tokens on valid code", async () => {
      mockOAuthService = createMockOAuthService({
        consumeAuthorizationCode: async () => ({
          clientId: "test-client",
          userId: "user-uuid",
          redirectUri: "https://example.com/cb",
          scope: "graphein",
          resource: "https://graphein.example.com/mcp",
          codeChallenge: "challenge",
          codeChallengeMethod: "S256",
        }),
        createRefreshToken: async () => "new-refresh-token",
      });
      provider = new GrapheinOAuthProvider(
        mockOAuthService,
        createMockUserService(),
        mockSession,
        BASE_URL,
        MCP_JWT_SECRET,
      );

      const tokens = await provider.exchangeAuthorizationCode(
        { client_id: "test-client" } as any,
        "valid-code",
        "verifier",
        "https://example.com/cb",
        new URL("https://graphein.example.com/mcp"),
      );

      expect(tokens.token_type).toBe("Bearer");
      expect(tokens.expires_in).toBe(3600);
      expect(tokens.refresh_token).toBe("new-refresh-token");
      expect(tokens.scope).toBe("graphein");

      // Verify the access token is a valid JWT
      const decoded = (await verify(tokens.access_token, MCP_JWT_SECRET, "HS256")) as any;
      expect(decoded.sub).toBe("user-uuid");
      expect(decoded.aud).toBe("https://graphein.example.com/mcp");
      expect(decoded.typ).toBe("mcp+jwt");
      expect(decoded.scope).toBe("graphein");
    });

    test("throws on invalid code", async () => {
      await expect(
        provider.exchangeAuthorizationCode({ client_id: "x" } as any, "bad-code"),
      ).rejects.toThrow("Invalid or expired authorization code");
    });

    test("throws on client ID mismatch", async () => {
      mockOAuthService = createMockOAuthService({
        consumeAuthorizationCode: async () => ({
          clientId: "other-client",
          userId: "u",
          redirectUri: "r",
          scope: "s",
          resource: "res",
          codeChallenge: "c",
          codeChallengeMethod: "S256",
        }),
      });
      provider = new GrapheinOAuthProvider(
        mockOAuthService,
        createMockUserService(),
        mockSession,
        BASE_URL,
        MCP_JWT_SECRET,
      );

      await expect(
        provider.exchangeAuthorizationCode({ client_id: "test-client" } as any, "code"),
      ).rejects.toThrow("Client ID mismatch");
    });

    test("throws on redirect URI mismatch", async () => {
      mockOAuthService = createMockOAuthService({
        consumeAuthorizationCode: async () => ({
          clientId: "test-client",
          userId: "u",
          redirectUri: "https://example.com/cb",
          scope: "s",
          resource: "https://graphein.example.com/mcp",
          codeChallenge: "c",
          codeChallengeMethod: "S256",
        }),
      });
      provider = new GrapheinOAuthProvider(
        mockOAuthService,
        createMockUserService(),
        mockSession,
        BASE_URL,
        MCP_JWT_SECRET,
      );

      await expect(
        provider.exchangeAuthorizationCode(
          { client_id: "test-client" } as any,
          "code",
          "verifier",
          "https://evil.example.com/cb",
        ),
      ).rejects.toThrow("Redirect URI mismatch");
    });

    test("throws on resource mismatch", async () => {
      mockOAuthService = createMockOAuthService({
        consumeAuthorizationCode: async () => ({
          clientId: "test-client",
          userId: "u",
          redirectUri: "r",
          scope: "s",
          resource: "https://other.example.com/mcp",
          codeChallenge: "c",
          codeChallengeMethod: "S256",
        }),
      });
      provider = new GrapheinOAuthProvider(
        mockOAuthService,
        createMockUserService(),
        mockSession,
        BASE_URL,
        MCP_JWT_SECRET,
      );

      await expect(
        provider.exchangeAuthorizationCode(
          { client_id: "test-client" } as any,
          "code",
          undefined,
          undefined,
          new URL("https://graphein.example.com/mcp"),
        ),
      ).rejects.toThrow("Resource mismatch");
    });
  });

  describe("exchangeRefreshToken", () => {
    test("rotates refresh token and issues new access token", async () => {
      mockOAuthService = createMockOAuthService({
        consumeRefreshToken: async () => ({
          clientId: "test-client",
          userId: "user-uuid",
          scope: "graphein",
          resource: "https://graphein.example.com/mcp",
        }),
        createRefreshToken: async () => "rotated-refresh-token",
      });
      provider = new GrapheinOAuthProvider(
        mockOAuthService,
        createMockUserService(),
        mockSession,
        BASE_URL,
        MCP_JWT_SECRET,
      );

      const tokens = await provider.exchangeRefreshToken(
        { client_id: "test-client" } as any,
        "old-refresh",
        ["graphein"],
        new URL("https://graphein.example.com/mcp"),
      );

      expect(tokens.token_type).toBe("Bearer");
      expect(tokens.refresh_token).toBe("rotated-refresh-token");
      expect(tokens.expires_in).toBe(3600);
    });

    test("throws on invalid refresh token", async () => {
      await expect(
        provider.exchangeRefreshToken(
          { client_id: "x" } as any,
          "bad",
          [],
          new URL("https://example.com/mcp"),
        ),
      ).rejects.toThrow("Invalid or expired refresh token");
    });
  });

  describe("verifyAccessToken", () => {
    test("verifies valid token", async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await sign(
        {
          sub: "user-uuid",
          aud: "https://graphein.example.com/mcp",
          scope: "graphein",
          typ: "mcp+jwt",
          exp: now + 3600,
          iat: now,
        },
        MCP_JWT_SECRET,
        "HS256",
      );

      const info = await provider.verifyAccessToken(token);
      expect(info.token).toBe(token);
      expect(info.scopes).toEqual(["graphein"]);
      expect(info.resource).toEqual(new URL("https://graphein.example.com/mcp"));
      expect(info.extra?.sub).toBe("user-uuid");
    });

    test("rejects expired token", async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await sign(
        {
          sub: "user-uuid",
          aud: "https://graphein.example.com/mcp",
          scope: "graphein",
          typ: "mcp+jwt",
          exp: now - 10,
          iat: now - 3610,
        },
        MCP_JWT_SECRET,
        "HS256",
      );

      await expect(provider.verifyAccessToken(token)).rejects.toThrow();
    });

    test("rejects wrong typ", async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await sign(
        {
          sub: "user-uuid",
          aud: "https://graphein.example.com/mcp",
          scope: "graphein",
          typ: "wrong",
          exp: now + 3600,
          iat: now,
        },
        MCP_JWT_SECRET,
        "HS256",
      );

      await expect(provider.verifyAccessToken(token)).rejects.toThrow("Invalid token type");
    });

    test("rejects nonexistent user", async () => {
      provider = new GrapheinOAuthProvider(
        mockOAuthService,
        createMockUserService({ findUserById: async () => undefined }),
        mockSession,
        BASE_URL,
        MCP_JWT_SECRET,
      );

      const now = Math.floor(Date.now() / 1000);
      const token = await sign(
        {
          sub: "deleted-user",
          aud: "https://graphein.example.com/mcp",
          scope: "graphein",
          typ: "mcp+jwt",
          exp: now + 3600,
          iat: now,
        },
        MCP_JWT_SECRET,
        "HS256",
      );

      await expect(provider.verifyAccessToken(token)).rejects.toThrow("User not found");
    });

    test("rejects deactivated user", async () => {
      provider = new GrapheinOAuthProvider(
        mockOAuthService,
        createMockUserService({
          findUserById: async () => ({ ...ACTIVE_USER, deactivatedAt: new Date() }),
        }),
        mockSession,
        BASE_URL,
        MCP_JWT_SECRET,
      );

      const now = Math.floor(Date.now() / 1000);
      const token = await sign(
        {
          sub: "user-uuid",
          aud: "https://graphein.example.com/mcp",
          scope: "graphein",
          typ: "mcp+jwt",
          exp: now + 3600,
          iat: now,
        },
        MCP_JWT_SECRET,
        "HS256",
      );

      await expect(provider.verifyAccessToken(token)).rejects.toThrow("User is deactivated");
    });

    test("rejects invalid signature", async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await sign(
        {
          sub: "user-uuid",
          aud: "x",
          scope: "graphein",
          typ: "mcp+jwt",
          exp: now + 3600,
          iat: now,
        },
        "wrong-secret",
        "HS256",
      );

      await expect(provider.verifyAccessToken(token)).rejects.toThrow("Invalid access token");
    });
  });

  describe("revokeToken", () => {
    test("delegates to oauth service", async () => {
      let revokedToken: string | undefined;
      mockOAuthService = createMockOAuthService({
        revokeRefreshToken: async (token: string) => {
          revokedToken = token;
        },
      });
      provider = new GrapheinOAuthProvider(
        mockOAuthService,
        createMockUserService(),
        mockSession,
        BASE_URL,
        MCP_JWT_SECRET,
      );

      await provider.revokeToken!({} as any, { token: "refresh-to-revoke" });
      expect(revokedToken).toBe("refresh-to-revoke");
    });
  });
});
