import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";

// Replicate the anti-clickjacking middleware from app.ts
const antiClickjackingMiddleware: MiddlewareHandler = async (c, next) => {
  await next();
  c.header("Content-Security-Policy", "frame-ancestors 'none'");
  c.header("X-Frame-Options", "DENY");
};

function createApp() {
  const app = new Hono();
  app.use("*", antiClickjackingMiddleware);
  app.get("/page", (c) => c.html("<h1>Hello</h1>"));
  app.post("/action", (c) => c.text("ok"));
  return app;
}

describe("anti-clickjacking headers", () => {
  const app = createApp();

  test("GET response includes Content-Security-Policy frame-ancestors", async () => {
    const res = await app.request("/page", { method: "GET" });
    expect(res.headers.get("Content-Security-Policy")).toBe("frame-ancestors 'none'");
  });

  test("GET response includes X-Frame-Options DENY", async () => {
    const res = await app.request("/page", { method: "GET" });
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  test("POST response includes Content-Security-Policy frame-ancestors", async () => {
    const res = await app.request("/action", { method: "POST" });
    expect(res.headers.get("Content-Security-Policy")).toBe("frame-ancestors 'none'");
  });

  test("POST response includes X-Frame-Options DENY", async () => {
    const res = await app.request("/action", { method: "POST" });
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });
});
