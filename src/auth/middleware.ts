import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import type { JwtPayload } from "./session";

declare module "hono" {
  interface ContextVariableMap {
    jwtPayload: JwtPayload;
    isAdmin: boolean;
  }
}

export function createAuthMiddleware(
  verifyToken: (token: string) => Promise<JwtPayload | null>,
  isAdminFn: (userId: string) => Promise<boolean>,
) {
  const authMiddleware = createMiddleware(async (c, next) => {
    const token = getCookie(c, "token");
    if (!token) {
      return c.redirect("/auth/login");
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return c.redirect("/auth/login");
    }

    c.set("jwtPayload", payload);
    c.set("isAdmin", await isAdminFn(payload.sub));
    await next();
  });

  const adminMiddleware = createMiddleware(async (c, next) => {
    if (!c.get("isAdmin")) {
      return c.text("Forbidden", 403);
    }
    await next();
  });

  return { authMiddleware, adminMiddleware };
}
