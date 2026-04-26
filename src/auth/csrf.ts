import { createMiddleware } from "hono/factory";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Paths exempt from CSRF checks (verified by their own mechanisms)
const EXEMPT_PREFIXES = [
  "/slack/",
  "/api/",
  "/mcp",
  "/oauth/token",
  "/oauth/register",
  "/oauth/revoke",
];

/**
 * CSRF protection middleware that verifies the Origin (or Referer) header
 * on state-changing requests matches the application's own origin.
 *
 * This is the OWASP-recommended "verifying origin with standard headers"
 * approach and provides defense-in-depth alongside SameSite=Lax cookies.
 *
 * Slack webhook endpoints are exempt — they use signing-secret verification
 * via Bolt's built-in request validation.
 */
export function createCsrfMiddleware(baseUrl: string) {
  return createMiddleware(async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) {
      return next();
    }

    const path = new URL(c.req.url).pathname;
    if (EXEMPT_PREFIXES.some((p) => path.startsWith(p))) {
      return next();
    }

    const expectedOrigin = new URL(baseUrl).origin;

    // Prefer Origin header; fall back to Referer
    const origin = c.req.header("Origin");
    if (origin) {
      if (origin !== expectedOrigin) {
        return c.text("Forbidden", 403);
      }
      return next();
    }

    const referer = c.req.header("Referer");
    if (referer) {
      try {
        const refererOrigin = new URL(referer).origin;
        if (refererOrigin !== expectedOrigin) {
          return c.text("Forbidden", 403);
        }
        return next();
      } catch {
        return c.text("Forbidden", 403);
      }
    }

    // Neither Origin nor Referer present — reject
    return c.text("Forbidden", 403);
  });
}
