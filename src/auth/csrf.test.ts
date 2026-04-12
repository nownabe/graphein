import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import { createCsrfMiddleware } from "./csrf";

const csrfMiddleware = createCsrfMiddleware("https://app.example.com");

function createApp() {
  const app = new Hono();
  app.use("*", csrfMiddleware);
  app.get("/safe", (c) => c.text("ok"));
  app.post("/mutate", (c) => c.text("ok"));
  app.patch("/update", (c) => c.text("ok"));
  app.delete("/remove", (c) => c.text("ok"));
  app.post("/slack/events", (c) => c.text("ok"));
  app.post("/slack/interactions", (c) => c.text("ok"));
  return app;
}

describe("csrfMiddleware", () => {
  const app = createApp();

  test("allows GET requests without Origin/Referer", async () => {
    const res = await app.request("/safe", { method: "GET" });
    expect(res.status).toBe(200);
  });

  test("allows HEAD requests without Origin/Referer", async () => {
    const res = await app.request("/safe", { method: "HEAD" });
    expect(res.status).not.toBe(403);
  });

  test("allows OPTIONS requests without Origin/Referer", async () => {
    const res = await app.request("/safe", { method: "OPTIONS" });
    expect(res.status).not.toBe(403);
  });

  test("rejects POST without Origin or Referer", async () => {
    const res = await app.request("/mutate", { method: "POST" });
    expect(res.status).toBe(403);
  });

  test("rejects PATCH without Origin or Referer", async () => {
    const res = await app.request("/update", { method: "PATCH" });
    expect(res.status).toBe(403);
  });

  test("rejects DELETE without Origin or Referer", async () => {
    const res = await app.request("/remove", { method: "DELETE" });
    expect(res.status).toBe(403);
  });

  test("allows POST with matching Origin", async () => {
    const res = await app.request("/mutate", {
      method: "POST",
      headers: { Origin: "https://app.example.com" },
    });
    expect(res.status).toBe(200);
  });

  test("rejects POST with mismatched Origin", async () => {
    const res = await app.request("/mutate", {
      method: "POST",
      headers: { Origin: "https://evil.com" },
    });
    expect(res.status).toBe(403);
  });

  test("allows POST with matching Referer (no Origin)", async () => {
    const res = await app.request("/mutate", {
      method: "POST",
      headers: { Referer: "https://app.example.com/tasks" },
    });
    expect(res.status).toBe(200);
  });

  test("rejects POST with mismatched Referer (no Origin)", async () => {
    const res = await app.request("/mutate", {
      method: "POST",
      headers: { Referer: "https://evil.com/attack" },
    });
    expect(res.status).toBe(403);
  });

  test("rejects POST with invalid Referer URL", async () => {
    const res = await app.request("/mutate", {
      method: "POST",
      headers: { Referer: "not-a-url" },
    });
    expect(res.status).toBe(403);
  });

  test("Origin takes precedence over Referer", async () => {
    const res = await app.request("/mutate", {
      method: "POST",
      headers: {
        Origin: "https://app.example.com",
        Referer: "https://evil.com/attack",
      },
    });
    expect(res.status).toBe(200);
  });

  test("bad Origin overrides good Referer", async () => {
    const res = await app.request("/mutate", {
      method: "POST",
      headers: {
        Origin: "https://evil.com",
        Referer: "https://app.example.com/tasks",
      },
    });
    expect(res.status).toBe(403);
  });

  test("exempts /slack/events from CSRF check", async () => {
    const res = await app.request("/slack/events", { method: "POST" });
    expect(res.status).toBe(200);
  });

  test("exempts /slack/interactions from CSRF check", async () => {
    const res = await app.request("/slack/interactions", { method: "POST" });
    expect(res.status).toBe(200);
  });
});
