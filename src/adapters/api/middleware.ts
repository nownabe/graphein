import { createMiddleware } from "hono/factory";
import type { ApiKeyService, ApiKeyRole } from "../../application/api-keys/service";
import type { users } from "../../infrastructure/db/schema";
import type { CacheStore } from "../../infrastructure/cache/store";

// ---------------------------------------------------------------------------
// Context variable types for API-authenticated requests
// ---------------------------------------------------------------------------

export interface ApiContext {
  apiUser: typeof users.$inferSelect;
  apiRole: ApiKeyRole;
  apiKeyHash: string;
}

declare module "hono" {
  interface ContextVariableMap {
    apiUser: typeof users.$inferSelect;
    apiRole: ApiKeyRole;
    apiKeyHash: string;
  }
}

// ---------------------------------------------------------------------------
// Bearer token extraction
// ---------------------------------------------------------------------------

export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  if (header.length < 8) return null; // "Bearer " + at least 1 char
  const scheme = header.slice(0, 7);
  if (scheme.toLowerCase() !== "bearer ") return null;
  const token = header.slice(7);
  if (token.length === 0) return null;
  return token;
}

// ---------------------------------------------------------------------------
// Rate limiter (fixed-window, backed by CacheStore)
// ---------------------------------------------------------------------------

const RATE_LIMIT = 60;
const WINDOW_MS = 60_000;

export function createRateLimiter(cache: CacheStore) {
  /**
   * Check and increment the request count for a given key hash.
   * Returns the remaining requests, or -1 if the limit is exceeded.
   */
  async function check(keyHash: string): Promise<{ remaining: number; resetAt: number }> {
    const currentWindow = Math.floor(Date.now() / WINDOW_MS);
    const resetAt = (currentWindow + 1) * WINDOW_MS;
    const ttlMs = resetAt - Date.now();

    const cacheKey = `ratelimit:${currentWindow}:${keyHash}`;
    const count = await cache.increment(cacheKey, ttlMs);

    if (count > RATE_LIMIT) {
      return { remaining: -1, resetAt };
    }

    return { remaining: RATE_LIMIT - count, resetAt };
  }

  return { check };
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

export function createApiAuthMiddleware(apiKeyService: ApiKeyService) {
  return createMiddleware(async (c, next) => {
    const authHeader = c.req.header("Authorization");
    const token = extractBearerToken(authHeader);

    if (!token) {
      return c.json(
        { error: { code: "unauthorized", message: "Missing or invalid Authorization header" } },
        401,
      );
    }

    const result = await apiKeyService.verifyApiKey(token);
    if (!result) {
      return c.json(
        { error: { code: "unauthorized", message: "Invalid or expired API key" } },
        401,
      );
    }

    c.set("apiUser", result.user);
    c.set("apiRole", result.role);

    // Compute key hash hex for rate limiting
    const data = new TextEncoder().encode(token);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashHex = Buffer.from(hashBuffer).toString("hex");
    c.set("apiKeyHash", hashHex);

    await next();
  });
}

// ---------------------------------------------------------------------------
// Rate limit middleware
// ---------------------------------------------------------------------------

export function createApiRateLimitMiddleware(rateLimiter: ReturnType<typeof createRateLimiter>) {
  return createMiddleware(async (c, next) => {
    const keyHash = c.get("apiKeyHash");
    const { remaining, resetAt } = await rateLimiter.check(keyHash);
    const resetAtSeconds = Math.ceil(resetAt / 1000);

    if (remaining < 0) {
      const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
      c.header("Retry-After", String(retryAfter));
      c.header("X-RateLimit-Limit", String(RATE_LIMIT));
      c.header("X-RateLimit-Remaining", "0");
      c.header("X-RateLimit-Reset", String(resetAtSeconds));
      return c.json(
        {
          error: { code: "rate_limited", message: "Rate limit exceeded. Try again later." },
        },
        429,
      );
    }

    // Set rate limit headers on the response
    c.header("X-RateLimit-Limit", String(RATE_LIMIT));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(resetAtSeconds));

    await next();
  });
}

// ---------------------------------------------------------------------------
// Composed middleware: auth -> rate limit
// ---------------------------------------------------------------------------

export function createApiMiddleware(apiKeyService: ApiKeyService, cache: CacheStore) {
  const authMiddleware = createApiAuthMiddleware(apiKeyService);
  const rateLimiter = createRateLimiter(cache);
  const rateLimitMiddleware = createApiRateLimitMiddleware(rateLimiter);

  return { authMiddleware, rateLimitMiddleware, rateLimiter };
}
