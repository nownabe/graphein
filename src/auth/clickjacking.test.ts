import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import { clickjackingMiddleware } from "./clickjacking";

function createApp() {
  const app = new Hono();
  app.use("*", clickjackingMiddleware);
  app.get("/page", (c) => c.html("<h1>Hello</h1>"));
  app.post("/action", (c) => c.text("ok"));
  return app;
}

describe("clickjackingMiddleware", () => {
  const app = createApp();

  test("sets Content-Security-Policy frame-ancestors 'none' on GET", async () => {
    const res = await app.request("/page", { method: "GET" });
    expect(res.headers.get("Content-Security-Policy")).toBe("frame-ancestors 'none'");
  });

  test("sets X-Frame-Options DENY on GET", async () => {
    const res = await app.request("/page", { method: "GET" });
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  test("sets Content-Security-Policy frame-ancestors 'none' on POST", async () => {
    const res = await app.request("/action", { method: "POST" });
    expect(res.headers.get("Content-Security-Policy")).toBe("frame-ancestors 'none'");
  });

  test("sets X-Frame-Options DENY on POST", async () => {
    const res = await app.request("/action", { method: "POST" });
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });
});
