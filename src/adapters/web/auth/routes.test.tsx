import { describe, test, expect, beforeEach, mock } from "bun:test";
import { Hono } from "hono";
import { createAuthRoutes, type AuthRoutesConfig } from "./routes";
import type { SessionHelpers } from "../../../auth/session";
import type { UserService } from "../../../users/service";

const BASE_URL = "https://graphein.example.com";

const config: AuthRoutesConfig = {
  baseUrl: BASE_URL,
  slackClientId: "slack-client-id",
  slackClientSecret: "slack-client-secret",
  slackTeamId: "T_TEAM",
};

const fakeUser = {
  id: "user-uuid",
  slackUserId: "U123",
  email: "test@example.com",
  displayName: "Test User",
  avatarUrl: null,
  role: "user" as const,
  locale: "en" as const,
  theme: "dark" as const,
  deactivatedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createMockSession(overrides: Partial<SessionHelpers> = {}): SessionHelpers {
  return {
    createToken: mock(async () => "jwt-token"),
    verifyToken: mock(async () => ({
      sub: "user-uuid",
      name: "Test",
      typ: "session",
      exp: 9999999999,
    })),
    ...overrides,
  } as unknown as SessionHelpers;
}

function createMockUserService(overrides: Partial<UserService> = {}): UserService {
  return {
    findOrCreateUser: mock(async () => fakeUser),
    ...overrides,
  } as unknown as UserService;
}

function buildApp(
  sessionOverrides: Partial<SessionHelpers> = {},
  userServiceOverrides: Partial<UserService> = {},
) {
  const app = new Hono();
  const authRoutes = createAuthRoutes(
    config,
    createMockSession(sessionOverrides),
    createMockUserService(userServiceOverrides),
    false,
  );
  app.route("/auth", authRoutes);
  return app;
}

/** Extract cookies from a Set-Cookie response as a "Cookie" header value */
function extractCookies(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((h) => h.split(";")[0])
    .join("; ");
}

describe("auth routes — return_to", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  function restoreFetch() {
    globalThis.fetch = originalFetch;
  }

  describe("GET /auth/slack", () => {
    test("sets return_to cookie for same-origin absolute URL", async () => {
      const app = buildApp();
      const returnTo = `${BASE_URL}/oauth/authorize?client_id=abc`;
      const res = await app.request(`/auth/slack?return_to=${encodeURIComponent(returnTo)}`, {
        redirect: "manual",
      });

      expect(res.status).toBe(302);
      const cookies = res.headers.getSetCookie();
      const returnToCookie = cookies.find((c) => c.startsWith("return_to="));
      expect(returnToCookie).toBeDefined();
      // Cookie value is URL-encoded; decode to verify path+query
      expect(decodeURIComponent(returnToCookie!)).toContain("/oauth/authorize?client_id=abc");
    });

    test("sets return_to cookie for relative path", async () => {
      const app = buildApp();
      const res = await app.request("/auth/slack?return_to=/oauth/authorize", {
        redirect: "manual",
      });

      expect(res.status).toBe(302);
      const cookies = res.headers.getSetCookie();
      const returnToCookie = cookies.find((c) => c.startsWith("return_to="));
      expect(returnToCookie).toBeDefined();
      expect(decodeURIComponent(returnToCookie!)).toContain("/oauth/authorize");
    });

    test("ignores return_to for cross-origin URL", async () => {
      const app = buildApp();
      const returnTo = "https://evil.example.com/steal";
      const res = await app.request(`/auth/slack?return_to=${encodeURIComponent(returnTo)}`, {
        redirect: "manual",
      });

      expect(res.status).toBe(302);
      const cookies = res.headers.getSetCookie();
      const activeReturnTo = cookies.find(
        (c) => c.startsWith("return_to=") && !c.includes("Max-Age=0"),
      );
      expect(activeReturnTo).toBeUndefined();
    });

    test("does not set an active return_to cookie when parameter is absent", async () => {
      const app = buildApp();
      const res = await app.request("/auth/slack", { redirect: "manual" });

      expect(res.status).toBe(302);
      const cookies = res.headers.getSetCookie();
      const activeReturnTo = cookies.find(
        (c) => c.startsWith("return_to=") && !c.includes("Max-Age=0"),
      );
      expect(activeReturnTo).toBeUndefined();
    });

    test("clears stale return_to cookie when starting a new login without return_to", async () => {
      const app = buildApp();
      // Simulate a stale return_to cookie from a previous abandoned OAuth login
      const res = await app.request("/auth/slack", {
        headers: { Cookie: "return_to=%2Foauth%2Fauthorize%3Fclient_id%3Dold" },
        redirect: "manual",
      });

      expect(res.status).toBe(302);
      const cookies = res.headers.getSetCookie();
      // Should delete the stale cookie (Max-Age=0) and not set a new one
      const deletion = cookies.find((c) => c.startsWith("return_to=") && c.includes("Max-Age=0"));
      expect(deletion).toBeDefined();
      const newSet = cookies.find((c) => c.startsWith("return_to=") && !c.includes("Max-Age=0"));
      expect(newSet).toBeUndefined();
    });
  });

  describe("GET /auth/slack/callback", () => {
    function mockSlackApis() {
      globalThis.fetch = mock(async (input: string | URL | Request) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes("openid.connect.token")) {
          return Response.json({ ok: true, access_token: "slack-token" });
        }
        if (url.includes("openid.connect.userInfo")) {
          return Response.json({
            ok: true,
            sub: "U123",
            email: "test@example.com",
            name: "Test User",
            picture: null,
            "https://slack.com/team_id": "T_TEAM",
          });
        }
        return new Response(null, { status: 404 });
      }) as unknown as typeof fetch;
    }

    test("redirects to return_to path after successful login", async () => {
      const app = buildApp();
      mockSlackApis();

      // Step 1: Hit /auth/slack with return_to to get state + return_to cookies
      const slackRes = await app.request(
        `/auth/slack?return_to=${encodeURIComponent(`${BASE_URL}/oauth/authorize?client_id=abc`)}`,
        { redirect: "manual" },
      );
      const cookies = extractCookies(slackRes);

      // Step 2: Call the callback with valid state
      const state = cookies.match(/oauth_state=([^;]+)/)?.[1];
      const callbackRes = await app.request(`/auth/slack/callback?code=test-code&state=${state}`, {
        headers: { Cookie: cookies },
        redirect: "manual",
      });

      restoreFetch();

      expect(callbackRes.status).toBe(302);
      expect(callbackRes.headers.get("Location")).toBe("/oauth/authorize?client_id=abc");
    });

    test("redirects to /tasks when no return_to cookie is set", async () => {
      const app = buildApp();
      mockSlackApis();

      // Step 1: Hit /auth/slack without return_to
      const slackRes = await app.request("/auth/slack", { redirect: "manual" });
      const cookies = extractCookies(slackRes);

      // Step 2: Callback
      const state = cookies.match(/oauth_state=([^;]+)/)?.[1];
      const callbackRes = await app.request(`/auth/slack/callback?code=test-code&state=${state}`, {
        headers: { Cookie: cookies },
        redirect: "manual",
      });

      restoreFetch();

      expect(callbackRes.status).toBe(302);
      expect(callbackRes.headers.get("Location")).toBe("/tasks");
    });

    test("clears return_to cookie after consuming it", async () => {
      const app = buildApp();
      mockSlackApis();

      const slackRes = await app.request(
        `/auth/slack?return_to=${encodeURIComponent(`${BASE_URL}/oauth/authorize`)}`,
        { redirect: "manual" },
      );
      const cookies = extractCookies(slackRes);
      const state = cookies.match(/oauth_state=([^;]+)/)?.[1];

      const callbackRes = await app.request(`/auth/slack/callback?code=test-code&state=${state}`, {
        headers: { Cookie: cookies },
        redirect: "manual",
      });

      restoreFetch();

      const setCookies = callbackRes.headers.getSetCookie();
      const returnToDeletion = setCookies.find(
        (c) => c.startsWith("return_to=") && c.includes("Max-Age=0"),
      );
      expect(returnToDeletion).toBeDefined();
    });
  });
});
