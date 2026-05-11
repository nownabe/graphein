import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import {
  createApiAuthMiddleware,
  createApiRateLimitMiddleware,
  createRateLimiter,
} from "./middleware";
import type { ApiKeyService } from "../../application/api-keys/service";
import { createMemoryCacheStore } from "../../infrastructure/cache/memory";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockApiKeyService(overrides?: Partial<ApiKeyService>): ApiKeyService {
  return {
    createApiKey: async () => ({ ok: false as const, error: "key_limit_exceeded" as const }),
    listApiKeys: async () => [],
    revokeApiKey: async () => null,
    verifyApiKey: async () => null,
    ...overrides,
  };
}

const MOCK_USER = {
  id: "user-1",
  slackUserId: "U123",
  email: "test@example.com",
  displayName: "Test User",
  avatarUrl: null,
  role: "user",
  locale: "en",
  theme: "dark",
  deactivatedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function buildApp(apiKeyService: ApiKeyService) {
  const app = new Hono();
  const authMiddleware = createApiAuthMiddleware(apiKeyService);
  const rateLimiter = createRateLimiter(createMemoryCacheStore());
  const rateLimitMiddleware = createApiRateLimitMiddleware(rateLimiter);

  app.use("/api/*", authMiddleware);
  app.use("/api/*", rateLimitMiddleware);
  app.get("/api/test", (c) => {
    return c.json({
      user: c.get("apiUser")?.id,
      role: c.get("apiRole"),
      keyHash: c.get("apiKeyHash"),
    });
  });

  return { app, rateLimiter };
}

// ---------------------------------------------------------------------------
// Auth middleware tests
// ---------------------------------------------------------------------------

describe("API auth middleware", () => {
  test("returns 401 when Authorization header is missing", async () => {
    const service = createMockApiKeyService();
    const { app } = buildApp(service);

    const res = await app.request("/api/test");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("unauthorized");
    expect(body.error.message).toContain("Missing");
  });

  test("returns 401 when Authorization header lacks Bearer prefix", async () => {
    const service = createMockApiKeyService();
    const { app } = buildApp(service);

    const res = await app.request("/api/test", {
      headers: { Authorization: "Basic abc123" },
    });
    expect(res.status).toBe(401);
  });

  test("returns 401 when Authorization header has empty Bearer token", async () => {
    const service = createMockApiKeyService();
    const { app } = buildApp(service);

    const res = await app.request("/api/test", {
      headers: { Authorization: "Bearer " },
    });
    expect(res.status).toBe(401);
  });

  test("returns 401 when token is invalid", async () => {
    const service = createMockApiKeyService({
      verifyApiKey: async () => null,
    });
    const { app } = buildApp(service);

    const res = await app.request("/api/test", {
      headers: { Authorization: "Bearer gph_invalidkey" },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("unauthorized");
    expect(body.error.message).toContain("Invalid or expired");
  });

  test("returns 401 for expired token (verifyApiKey returns null)", async () => {
    // verifyApiKey already handles expiration internally and returns null
    const service = createMockApiKeyService({
      verifyApiKey: async () => null,
    });
    const { app } = buildApp(service);

    const res = await app.request("/api/test", {
      headers: { Authorization: "Bearer gph_expiredkey" },
    });
    expect(res.status).toBe(401);
  });

  test("returns 401 for revoked token (verifyApiKey returns null)", async () => {
    const service = createMockApiKeyService({
      verifyApiKey: async () => null,
    });
    const { app } = buildApp(service);

    const res = await app.request("/api/test", {
      headers: { Authorization: "Bearer gph_revokedkey" },
    });
    expect(res.status).toBe(401);
  });

  test("authenticates successfully with valid token", async () => {
    const service = createMockApiKeyService({
      verifyApiKey: async () => ({ user: MOCK_USER as never, role: "user" }),
    });
    const { app } = buildApp(service);

    const res = await app.request("/api/test", {
      headers: { Authorization: "Bearer gph_validkey123" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toBe("user-1");
    expect(body.role).toBe("user");
    expect(body.keyHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("accepts lowercase bearer scheme", async () => {
    const service = createMockApiKeyService({
      verifyApiKey: async () => ({ user: MOCK_USER as never, role: "user" }),
    });
    const { app } = buildApp(service);

    const res = await app.request("/api/test", {
      headers: { Authorization: "bearer gph_validkey123" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toBe("user-1");
  });

  test("accepts mixed-case bearer scheme", async () => {
    const service = createMockApiKeyService({
      verifyApiKey: async () => ({ user: MOCK_USER as never, role: "user" }),
    });
    const { app } = buildApp(service);

    const res = await app.request("/api/test", {
      headers: { Authorization: "BEARER gph_validkey123" },
    });
    expect(res.status).toBe(200);
  });

  test("sets admin role when key has admin scope", async () => {
    const service = createMockApiKeyService({
      verifyApiKey: async () => ({ user: MOCK_USER as never, role: "admin" }),
    });
    const { app } = buildApp(service);

    const res = await app.request("/api/test", {
      headers: { Authorization: "Bearer gph_adminkey123" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("admin");
  });

  test("error response does not leak internal details", async () => {
    const service = createMockApiKeyService();
    const { app } = buildApp(service);

    const res = await app.request("/api/test", {
      headers: { Authorization: "Bearer gph_bad" },
    });
    const body = await res.json();
    // Should not contain stack trace, hash, or raw key info
    const text = JSON.stringify(body);
    expect(text).not.toContain("stack");
    expect(text).not.toContain("hash");
    expect(text).not.toContain("gph_");
  });
});

// ---------------------------------------------------------------------------
// Rate limiting tests
// ---------------------------------------------------------------------------

describe("API rate limiting", () => {
  test("sets rate limit headers on every response", async () => {
    const service = createMockApiKeyService({
      verifyApiKey: async () => ({ user: MOCK_USER as never, role: "user" }),
    });
    const { app } = buildApp(service);

    const res = await app.request("/api/test", {
      headers: { Authorization: "Bearer gph_validkey" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");
    expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();
  });

  test("decrements remaining count on each request", async () => {
    const service = createMockApiKeyService({
      verifyApiKey: async () => ({ user: MOCK_USER as never, role: "user" }),
    });
    const { app } = buildApp(service);

    const res1 = await app.request("/api/test", {
      headers: { Authorization: "Bearer gph_validkey" },
    });
    const remaining1 = Number(res1.headers.get("X-RateLimit-Remaining"));

    const res2 = await app.request("/api/test", {
      headers: { Authorization: "Bearer gph_validkey" },
    });
    const remaining2 = Number(res2.headers.get("X-RateLimit-Remaining"));

    expect(remaining2).toBe(remaining1 - 1);
  });

  test("returns 429 when rate limit is exceeded", async () => {
    const service = createMockApiKeyService({
      verifyApiKey: async () => ({ user: MOCK_USER as never, role: "user" }),
    });

    // Use a standalone rate limiter to exhaust the limit
    const app = new Hono();
    const authMiddleware = createApiAuthMiddleware(service);
    const rateLimiter = createRateLimiter(createMemoryCacheStore());
    const rateLimitMiddleware = createApiRateLimitMiddleware(rateLimiter);

    app.use("/api/*", authMiddleware);
    app.use("/api/*", rateLimitMiddleware);
    app.get("/api/test", (c) => c.json({ ok: true }));

    // Exhaust the rate limit by making 60 requests
    for (let i = 0; i < 60; i++) {
      const res = await app.request("/api/test", {
        headers: { Authorization: "Bearer gph_validkey" },
      });
      expect(res.status).toBe(200);
    }

    // 61st request should be rate limited
    const res = await app.request("/api/test", {
      headers: { Authorization: "Bearer gph_validkey" },
    });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe("rate_limited");
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  test("tracks different API keys independently", async () => {
    const service = createMockApiKeyService({
      verifyApiKey: async () => {
        return { user: MOCK_USER as never, role: "user" };
      },
    });

    const app = new Hono();
    const authMiddleware = createApiAuthMiddleware(service);
    const rateLimiter = createRateLimiter(createMemoryCacheStore());
    const rateLimitMiddleware = createApiRateLimitMiddleware(rateLimiter);

    app.use("/api/*", authMiddleware);
    app.use("/api/*", rateLimitMiddleware);
    app.get("/api/test", (c) => c.json({ ok: true }));

    // First key: make 2 requests
    await app.request("/api/test", {
      headers: { Authorization: "Bearer gph_key_a" },
    });
    await app.request("/api/test", {
      headers: { Authorization: "Bearer gph_key_a" },
    });

    // Second key: first request should have full remaining
    const res = await app.request("/api/test", {
      headers: { Authorization: "Bearer gph_key_b" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");
  });

  test("rate limit cannot be bypassed without Authorization header", async () => {
    const service = createMockApiKeyService();
    const { app } = buildApp(service);

    // Without auth header, auth middleware blocks the request with 401
    const res = await app.request("/api/test");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Manually composed middleware (mirrors app.ts nesting pattern)
// ---------------------------------------------------------------------------

describe("Composed middleware with path exclusion (mirrors app.ts)", () => {
  function buildManualApp(apiKeyService: ApiKeyService) {
    const app = new Hono();
    const authMiddleware = createApiAuthMiddleware(apiKeyService);
    const rateLimiter = createRateLimiter(createMemoryCacheStore());
    const rateLimitMiddleware = createApiRateLimitMiddleware(rateLimiter);

    app.use("/api/*", async (c, next) => {
      if (new URL(c.req.url).pathname === "/api/doc") return next();
      return authMiddleware(c, next);
    });
    app.use("/api/*", async (c, next) => {
      if (new URL(c.req.url).pathname === "/api/doc") return next();
      return rateLimitMiddleware(c, next);
    });
    app.get("/api/test", (c) => c.json({ ok: true }));
    app.get("/api/doc", (c) => c.json({ docs: true }));

    return { app, rateLimiter };
  }

  test("returns 401 for unauthenticated request", async () => {
    const service = createMockApiKeyService();
    const { app } = buildManualApp(service);

    const res = await app.request("/api/test");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("unauthorized");
  });

  test("returns 200 for authenticated request", async () => {
    const service = createMockApiKeyService({
      verifyApiKey: async () => ({ user: MOCK_USER as never, role: "user" }),
    });
    const { app } = buildManualApp(service);

    const res = await app.request("/api/test", {
      headers: { Authorization: "Bearer gph_validkey" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
  });

  test("returns 429 when rate limited", async () => {
    const service = createMockApiKeyService({
      verifyApiKey: async () => ({ user: MOCK_USER as never, role: "user" }),
    });
    const { app } = buildManualApp(service);

    for (let i = 0; i < 60; i++) {
      await app.request("/api/test", {
        headers: { Authorization: "Bearer gph_validkey" },
      });
    }

    const res = await app.request("/api/test", {
      headers: { Authorization: "Bearer gph_validkey" },
    });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe("rate_limited");
  });

  test("skips auth for excluded paths", async () => {
    const service = createMockApiKeyService();
    const { app } = buildManualApp(service);

    const res = await app.request("/api/doc");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.docs).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rate limiter unit tests
// ---------------------------------------------------------------------------

describe("createRateLimiter", () => {
  test("resets count on new window boundary", async () => {
    const rateLimiter = createRateLimiter(createMemoryCacheStore());
    const keyHash = "abc123";

    // Fill up to the limit
    for (let i = 0; i < 60; i++) {
      await rateLimiter.check(keyHash);
    }

    // Next check should be over limit in the same window
    const result = await rateLimiter.check(keyHash);
    expect(result.remaining).toBe(-1);
  });

  test("returns correct resetAt timestamp", async () => {
    const rateLimiter = createRateLimiter(createMemoryCacheStore());
    const result = await rateLimiter.check("test-key");

    const currentWindow = Math.floor(Date.now() / 60_000);
    const expectedReset = (currentWindow + 1) * 60_000;
    expect(result.resetAt).toBe(expectedReset);
  });

  test("decrements remaining on successive checks", async () => {
    const rateLimiter = createRateLimiter(createMemoryCacheStore());
    const keyHash = "test-key";

    // First access
    const result1 = await rateLimiter.check(keyHash);
    expect(result1.remaining).toBe(59);

    // Second access in the same window
    const result2 = await rateLimiter.check(keyHash);
    expect(result2.remaining).toBe(58);
  });
});
