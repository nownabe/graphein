import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestApp, createTestUser, cleanupDb } from "./helpers";
import type { Database } from "../../src/db/client";

let db: Database;
let app: ReturnType<typeof createTestApp>["app"];

beforeEach(async () => {
  const ctx = createTestApp();
  app = ctx.app;
  db = ctx.db;
});

afterEach(async () => {
  await cleanupDb(db);
});

// ---------------------------------------------------------------------------
// GET /api/v1/doc — OpenAPI spec
// ---------------------------------------------------------------------------

describe("GET /api/v1/doc", () => {
  test("returns valid OpenAPI 3.0 JSON without authentication", async () => {
    const res = await app.request("/api/v1/doc");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const spec = await res.json();
    expect(spec.openapi).toBe("3.0.0");
    expect(spec.info.title).toBe("Graphein API");
    expect(spec.info.version).toBe("1.0.0");
  });

  test("defines bearerAuth security scheme", async () => {
    const res = await app.request("/api/v1/doc");
    const spec = await res.json();

    const scheme = spec.components?.securitySchemes?.bearerAuth;
    expect(scheme).toBeDefined();
    expect(scheme.type).toBe("http");
    expect(scheme.scheme).toBe("bearer");
  });

  test("declares global security requirement", async () => {
    const res = await app.request("/api/v1/doc");
    const spec = await res.json();

    expect(spec.security).toEqual([{ bearerAuth: [] }]);
  });

  test("all operation paths declare per-route security", async () => {
    const res = await app.request("/api/v1/doc");
    const spec = await res.json();

    const paths = spec.paths as Record<string, Record<string, { security?: unknown }>>;
    expect(Object.keys(paths).length).toBeGreaterThan(0);

    for (const [path, methods] of Object.entries(paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        if (typeof operation !== "object" || operation === null) continue;
        expect(operation.security).toEqual(
          [{ bearerAuth: [] }],
          `Expected security on ${method.toUpperCase()} ${path}`,
        );
      }
    }
  });

  test("includes expected endpoint paths", async () => {
    const res = await app.request("/api/v1/doc");
    const spec = await res.json();

    const paths = Object.keys(spec.paths);
    expect(paths).toContain("/tasks");
    expect(paths).toContain("/tasks/owned");
    expect(paths).toContain("/snippets");
    expect(paths).toContain("/kudos");
    expect(paths).toContain("/admin/users");
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/reference — Scalar API reference UI
// ---------------------------------------------------------------------------

describe("GET /api/v1/reference", () => {
  test("returns HTML page without authentication", async () => {
    const res = await app.request("/api/v1/reference");
    expect(res.status).toBe(200);

    const contentType = res.headers.get("content-type") ?? "";
    expect(contentType).toContain("text/html");
  });

  test("response body references the OpenAPI spec URL", async () => {
    const res = await app.request("/api/v1/reference");
    const html = await res.text();
    expect(html).toContain("/api/v1/doc");
  });
});
