import { describe, test, expect } from "bun:test";
import { createTestApp } from "../helpers/app";

const { app } = createTestApp();

describe("GET /healthz", () => {
  test("returns ok", async () => {
    const res = await app.request("/healthz", {
      headers: { Origin: "http://localhost:3000" },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});
