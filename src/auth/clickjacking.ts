import type { MiddlewareHandler } from "hono";

export const clickjackingMiddleware: MiddlewareHandler = async (c, next) => {
  await next();
  c.header("Content-Security-Policy", "frame-ancestors 'none'");
  c.header("X-Frame-Options", "DENY");
};
