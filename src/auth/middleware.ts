import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { verifyToken, type JwtPayload } from "./session";
import { isAdmin as fetchIsAdmin } from "../users/service";

declare module "hono" {
  interface ContextVariableMap {
    jwtPayload: JwtPayload;
    isAdmin: boolean;
  }
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const token = getCookie(c, "token");
  if (!token) {
    return c.redirect("/auth/login");
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return c.redirect("/auth/login");
  }

  c.set("jwtPayload", payload);
  c.set("isAdmin", await fetchIsAdmin(payload.sub));
  await next();
});

export const adminMiddleware = createMiddleware(async (c, next) => {
  if (!c.get("isAdmin")) {
    return c.text("Forbidden", 403);
  }
  await next();
});
