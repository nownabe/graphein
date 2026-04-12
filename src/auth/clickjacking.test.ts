import { describe, test, expect } from "bun:test";

// Set env vars before importing app (which imports env.ts)
process.env.BASE_URL = "https://app.example.com";
process.env.DATABASE_URL = "postgres://localhost/test";
process.env.SLACK_BOT_TOKEN = "xoxb-test";
process.env.SLACK_SIGNING_SECRET = "test";
process.env.SLACK_CLIENT_ID = "test";
process.env.SLACK_CLIENT_SECRET = "test";
process.env.GEMINI_API_KEY = "test";
process.env.JWT_SECRET = "test";

const { default: app } = await import("../app");

describe("anti-clickjacking headers", () => {
  test("response includes Content-Security-Policy frame-ancestors 'none'", async () => {
    const res = await app.request("/healthz", { method: "GET" });
    expect(res.headers.get("Content-Security-Policy")).toBe("frame-ancestors 'none'");
  });

  test("response includes X-Frame-Options DENY", async () => {
    const res = await app.request("/healthz", { method: "GET" });
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });
});
