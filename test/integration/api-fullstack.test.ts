import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { tasks, taskAssignees, taskOwners } from "../../src/db/schema";
import { createTestApp, createTestUser, cleanupDb } from "./helpers";

/**
 * Full-stack integration tests for /api/v1 endpoints.
 *
 * These tests hit the real app (createHonoApp) with real API keys persisted in
 * the database — no mocked verifyApiKey. They validate the composed middleware
 * chain: auth → rate limit → route handler.
 */

// Create the app (and its DB pool) once per file to avoid exhausting connections
// when bun runs all integration test files in parallel.
const ctx = createTestApp();
const { db, app, apiKeyService } = ctx;

beforeEach(async () => {
  await cleanupDb(db);
});

afterEach(async () => {
  await cleanupDb(db);
});

/** Helper: create a user and generate a real API key for them. */
async function createUserWithKey(
  overrides?: Partial<Parameters<typeof createTestUser>[1]>,
  keyRole: "user" | "admin" = "user",
) {
  const role = overrides?.role ?? (keyRole === "admin" ? "admin" : "user");
  const user = await createTestUser(db, { role, ...overrides });
  const result = await apiKeyService.createApiKey(user.id, "test-key", keyRole);
  if (!result.ok) throw new Error(`Failed to create API key: ${result.error}`);
  return { user, rawKey: result.rawKey };
}

/** Helper: make a request with a Bearer token against the full app. */
function apiRequest(path: string, rawKey: string, init?: RequestInit) {
  return app.request(`/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${rawKey}`,
      ...init?.headers,
    },
  });
}

// ---------------------------------------------------------------------------
// Auth middleware — real key verification through the full app
// ---------------------------------------------------------------------------

describe("full-stack auth", () => {
  test("returns 401 without Authorization header", async () => {
    const res = await app.request("/api/v1/tasks");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("unauthorized");
  });

  test("returns 401 with an invalid key", async () => {
    const res = await apiRequest("/tasks", "gph_bogus_key_value");
    expect(res.status).toBe(401);
  });

  test("returns 200 with a valid user key", async () => {
    const { rawKey, user } = await createUserWithKey();
    // Ensure the user has at least one assigned task so the list isn't empty
    const [task] = await db.insert(tasks).values({ title: "T", createdById: user.id }).returning();
    await db.insert(taskOwners).values({ taskId: task.id, userId: user.id });
    await db.insert(taskAssignees).values({ taskId: task.id, userId: user.id });

    const res = await apiRequest("/tasks", rawKey);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tasks).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Non-admin path — user-scoped key on /tasks
// ---------------------------------------------------------------------------

describe("non-admin path: GET /api/v1/tasks", () => {
  test("lists tasks assigned to the authenticated user", async () => {
    const { rawKey, user } = await createUserWithKey();
    const other = await createTestUser(db, { slackUserId: "U_OTHER_FA", displayName: "Other" });

    // Task assigned to the user
    const [t1] = await db
      .insert(tasks)
      .values({ title: "Assigned", createdById: other.id })
      .returning();
    await db.insert(taskOwners).values({ taskId: t1.id, userId: other.id });
    await db.insert(taskAssignees).values({ taskId: t1.id, userId: user.id });

    // Task NOT assigned to the user
    const [t2] = await db
      .insert(tasks)
      .values({ title: "Not Assigned", createdById: other.id })
      .returning();
    await db.insert(taskOwners).values({ taskId: t2.id, userId: other.id });
    await db.insert(taskAssignees).values({ taskId: t2.id, userId: other.id });

    const res = await apiRequest("/tasks", rawKey);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0].title).toBe("Assigned");
  });
});

// ---------------------------------------------------------------------------
// Admin path — admin-scoped key on /admin/users
// ---------------------------------------------------------------------------

describe("admin path: GET /api/v1/admin/users", () => {
  test("admin key can access admin endpoints", async () => {
    const { rawKey } = await createUserWithKey({ role: "admin", displayName: "Admin" }, "admin");

    const res = await apiRequest("/admin/users", rawKey);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toBeDefined();
  });

  test("user key is rejected from admin endpoints", async () => {
    const { rawKey } = await createUserWithKey({ displayName: "Regular" }, "user");

    const res = await apiRequest("/admin/users", rawKey);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("forbidden");
  });
});

// ---------------------------------------------------------------------------
// Rate limiting on the full /api/v1 stack
// ---------------------------------------------------------------------------

describe("rate limiting on full /api/v1 stack", () => {
  // The rate limiter uses Date.now() to determine the current window.
  // Pin the clock to the start of a window so tests never straddle a boundary.
  const WINDOW_MS = 60_000;
  let realDateNow: () => number;
  let frozenTime: number;

  beforeEach(() => {
    realDateNow = Date.now;
    // Pick a timestamp at the start of a window so all 61 requests fit in one.
    frozenTime = Math.floor(realDateNow() / WINDOW_MS) * WINDOW_MS + 1_000;
    Date.now = () => frozenTime;
  });

  afterEach(() => {
    Date.now = realDateNow;
  });

  test("rate limit headers are present on successful responses", async () => {
    const { rawKey } = await createUserWithKey();

    const res = await apiRequest("/tasks", rawKey);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(res.headers.get("X-RateLimit-Remaining")).toBeDefined();
    expect(res.headers.get("X-RateLimit-Reset")).toBeDefined();
  });

  test("returns 429 after exceeding the rate limit", async () => {
    const { rawKey } = await createUserWithKey();

    // Send 60 requests to exhaust the limit
    for (let i = 0; i < 60; i++) {
      const res = await apiRequest("/tasks", rawKey);
      expect(res.status).toBe(200);
    }

    // 61st request should be rate-limited
    const res = await apiRequest("/tasks", rawKey);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe("rate_limited");
    expect(res.headers.get("Retry-After")).toBeDefined();
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  test("rate limit is per-key (different keys have separate limits)", async () => {
    const { rawKey: key1 } = await createUserWithKey({
      slackUserId: "U_RL1",
      displayName: "RL1",
    });
    const { rawKey: key2 } = await createUserWithKey({
      slackUserId: "U_RL2",
      displayName: "RL2",
    });

    // Exhaust key1's limit
    for (let i = 0; i < 60; i++) {
      await apiRequest("/tasks", key1);
    }
    const res1 = await apiRequest("/tasks", key1);
    expect(res1.status).toBe(429);

    // key2 should still work
    const res2 = await apiRequest("/tasks", key2);
    expect(res2.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Doc endpoints are accessible without auth
// ---------------------------------------------------------------------------

describe("doc endpoints bypass auth", () => {
  test("GET /api/v1/doc is accessible without auth", async () => {
    const res = await app.request("/api/v1/doc");
    expect(res.status).toBe(200);
  });

  test("GET /api/v1/reference is accessible without auth", async () => {
    const res = await app.request("/api/v1/reference");
    expect(res.status).toBe(200);
  });
});
