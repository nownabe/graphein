import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { verifyToken, type JwtPayload } from "./session";

declare module "hono" {
  interface ContextVariableMap {
    jwtPayload: JwtPayload;
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
  await next();
});
