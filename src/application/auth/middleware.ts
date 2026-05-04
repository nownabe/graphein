import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import type { JwtPayload } from "./session";

declare module "hono" {
  interface ContextVariableMap {
    jwtPayload: JwtPayload;
    isAdmin: boolean;
    avatarUrl: string | null;
  }
}

export function createAuthMiddleware(
  verifyToken: (token: string) => Promise<JwtPayload | null>,
  getUserInfo: (userId: string) => Promise<{ isAdmin: boolean; avatarUrl: string | null }>,
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
    const info = await getUserInfo(payload.sub);
    c.set("isAdmin", info.isAdmin);
    c.set("avatarUrl", info.avatarUrl);
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
