import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { createTaskApiRoutes } from "../../src/api/tasks";
import { createApiAuthMiddleware } from "../../src/api/middleware";
import { createDb } from "../../src/db/client";
import { createTaskService } from "../../src/tasks/service";
import { users, tasks, taskAssignees, taskOwners } from "../../src/db/schema";
import type { ApiKeyService } from "../../src/api-keys/service";
import { TEST_DATABASE_URL } from "./setup";
import { cleanupDb } from "./helpers";

const db = createDb(TEST_DATABASE_URL, { max: 1 });
const taskService = createTaskService(db);

function createMockApiKeyService(
  mockUser: typeof users.$inferSelect,
  role: "user" | "admin" = "user",
): ApiKeyService {
  return {
    createApiKey: async () => ({ ok: false as const, error: "key_limit_exceeded" as const }),
    listApiKeys: async () => [],
    revokeApiKey: async () => null,
    verifyApiKey: async () => ({ user: mockUser as never, role }),
  };
}

function buildApp(mockUser: typeof users.$inferSelect, role: "user" | "admin" = "user") {
  const apiKeyService = createMockApiKeyService(mockUser, role);
  const authMiddleware = createApiAuthMiddleware(apiKeyService);
  const taskRoutes = createTaskApiRoutes({ taskService, db });

  const app = new Hono();
  app.use("/*", authMiddleware);
  app.route("/", taskRoutes);
  return app;
}

async function req(app: Hono, path: string, init?: RequestInit) {
  return app.request(path, {
    ...init,
    headers: {
      Authorization: "Bearer gph_testkey",
      ...init?.headers,
    },
  });
}

async function createUser(overrides?: Partial<typeof users.$inferInsert>) {
  const [user] = await db
    .insert(users)
    .values({
      slackUserId: `U${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      email: "test@example.com",
      displayName: "Test User",
      ...overrides,
    })
    .returning();
  return user;
}

async function createTask(createdById: string, overrides?: Partial<typeof tasks.$inferInsert>) {
  const [task] = await db
    .insert(tasks)
    .values({
      title: "Test Task",
      createdById,
      ...overrides,
    })
    .returning();
  // Auto-add creator as owner
  await db.insert(taskOwners).values({ taskId: task.id, userId: createdById });
  return task;
}

async function addAssignee(taskId: string, userId: string, done = false) {
  await db.insert(taskAssignees).values({ taskId, userId, done });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await cleanupDb(db);
});

afterEach(async () => {
  await cleanupDb(db);
});

// ---------------------------------------------------------------------------
// GET /tasks — list assigned tasks
// ---------------------------------------------------------------------------

describe("GET /tasks", () => {
  test("returns tasks assigned to the authenticated user", async () => {
    const user = await createUser();
    const other = await createUser({ slackUserId: "U_OTHER", displayName: "Other" });
    const task1 = await createTask(other.id, { title: "Task 1" });
    const task2 = await createTask(other.id, { title: "Task 2" });
    await addAssignee(task1.id, user.id);
    await addAssignee(task2.id, user.id, true);

    // Task not assigned to user
    const task3 = await createTask(other.id, { title: "Task 3" });
    await addAssignee(task3.id, other.id);

    const app = buildApp(user);
    const res = await req(app, "/tasks");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tasks).toHaveLength(2);
    expect(body.totalSize).toBe(2);
  });

  test("includes the user's own done status", async () => {
    const user = await createUser();
    const owner = await createUser({ slackUserId: "U_OWNER", displayName: "Owner" });
    const task = await createTask(owner.id, { title: "My Task" });
    await addAssignee(task.id, user.id, true);

    const app = buildApp(user);
    const res = await req(app, "/tasks");
    const body = await res.json();
    expect(body.tasks[0].done).toBe(true);
  });

  test("filters by done status", async () => {
    const user = await createUser();
    const owner = await createUser({ slackUserId: "U_OWNER", displayName: "Owner" });
    const task1 = await createTask(owner.id, { title: "Done task" });
    const task2 = await createTask(owner.id, { title: "Not done task" });
    await addAssignee(task1.id, user.id, true);
    await addAssignee(task2.id, user.id, false);

    const app = buildApp(user);

    const res1 = await req(app, "/tasks?done=true");
    const body1 = await res1.json();
    expect(body1.tasks).toHaveLength(1);
    expect(body1.tasks[0].done).toBe(true);

    const res2 = await req(app, "/tasks?done=false");
    const body2 = await res2.json();
    expect(body2.tasks).toHaveLength(1);
    expect(body2.tasks[0].done).toBe(false);
  });

  test("filters by status (archived)", async () => {
    const user = await createUser();
    const owner = await createUser({ slackUserId: "U_OWNER", displayName: "Owner" });
    const active = await createTask(owner.id, { title: "Active", archived: false });
    const archived = await createTask(owner.id, { title: "Archived", archived: true });
    await addAssignee(active.id, user.id);
    await addAssignee(archived.id, user.id);

    const app = buildApp(user);

    const res1 = await req(app, "/tasks?status=active");
    const body1 = await res1.json();
    expect(body1.tasks).toHaveLength(1);
    expect(body1.tasks[0].title).toBe("Active");

    const res2 = await req(app, "/tasks?status=archived");
    const body2 = await res2.json();
    expect(body2.tasks).toHaveLength(1);
    expect(body2.tasks[0].title).toBe("Archived");
  });

  test("filters by deadline range", async () => {
    const user = await createUser();
    const owner = await createUser({ slackUserId: "U_OWNER", displayName: "Owner" });
    const early = await createTask(owner.id, {
      title: "Early",
      deadline: new Date("2026-04-10T00:00:00Z"),
    });
    const mid = await createTask(owner.id, {
      title: "Mid",
      deadline: new Date("2026-04-20T00:00:00Z"),
    });
    const late = await createTask(owner.id, {
      title: "Late",
      deadline: new Date("2026-04-30T00:00:00Z"),
    });
    await addAssignee(early.id, user.id);
    await addAssignee(mid.id, user.id);
    await addAssignee(late.id, user.id);

    const app = buildApp(user);

    const res = await req(
      app,
      "/tasks?deadlineAfter=2026-04-15T00:00:00Z&deadlineBefore=2026-04-25T00:00:00Z",
    );
    const body = await res.json();
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0].title).toBe("Mid");
  });

  test("paginates with pageSize and pageToken", async () => {
    const user = await createUser();
    const owner = await createUser({ slackUserId: "U_OWNER", displayName: "Owner" });

    // Create 3 tasks
    for (let i = 0; i < 3; i++) {
      const t = await createTask(owner.id, { title: `Task ${i}` });
      await addAssignee(t.id, user.id);
    }

    const app = buildApp(user);

    // Page 1
    const res1 = await req(app, "/tasks?pageSize=2");
    const body1 = await res1.json();
    expect(body1.tasks).toHaveLength(2);
    expect(body1.nextPageToken).not.toBe("");
    expect(body1.totalSize).toBe(3);

    // Page 2
    const res2 = await req(app, `/tasks?pageSize=2&pageToken=${body1.nextPageToken}`);
    const body2 = await res2.json();
    expect(body2.tasks).toHaveLength(1);
    expect(body2.nextPageToken).toBe("");
  });

  test("returns 422 when pageToken filters mismatch", async () => {
    const user = await createUser();
    const owner = await createUser({ slackUserId: "U_OWNER", displayName: "Owner" });

    // Need at least 2 tasks to get a nextPageToken with pageSize=1
    const t1 = await createTask(owner.id, { title: "Task 1" });
    const t2 = await createTask(owner.id, { title: "Task 2" });
    await addAssignee(t1.id, user.id);
    await addAssignee(t2.id, user.id);

    const app = buildApp(user);

    // Get a valid token with status=active
    const res1 = await req(app, "/tasks?pageSize=1");
    const body1 = await res1.json();
    expect(body1.nextPageToken).not.toBe("");

    // Use the token with different filters
    const res2 = await req(app, `/tasks?status=archived&pageToken=${body1.nextPageToken}`);
    expect(res2.status).toBe(422);
  });

  test("response includes createdBy info", async () => {
    const user = await createUser();
    const owner = await createUser({
      slackUserId: "U_CREATOR",
      displayName: "Creator Bob",
    });
    const t = await createTask(owner.id);
    await addAssignee(t.id, user.id);

    const app = buildApp(user);
    const res = await req(app, "/tasks");
    const body = await res.json();
    expect(body.tasks[0].createdBy.displayName).toBe("Creator Bob");
  });
});

// ---------------------------------------------------------------------------
// GET /tasks/owned — list owned tasks
// ---------------------------------------------------------------------------

describe("GET /tasks/owned", () => {
  test("returns owned tasks for regular user", async () => {
    const user = await createUser();
    const other = await createUser({ slackUserId: "U_OTHER", displayName: "Other" });

    await createTask(user.id, { title: "My Task" });
    await createTask(other.id, { title: "Other Task" });

    const app = buildApp(user, "user");
    const res = await req(app, "/tasks/owned");
    const body = await res.json();
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0].title).toBe("My Task");
  });

  test("returns all tasks for admin", async () => {
    const admin = await createUser({ role: "admin" });
    const other = await createUser({ slackUserId: "U_OTHER", displayName: "Other" });

    await createTask(admin.id, { title: "Admin Task" });
    await createTask(other.id, { title: "Other Task" });

    const app = buildApp(admin, "admin");
    const res = await req(app, "/tasks/owned");
    const body = await res.json();
    expect(body.tasks).toHaveLength(2);
  });

  test("includes progress with total and done counts", async () => {
    const user = await createUser();
    const a1 = await createUser({ slackUserId: "U_A1", displayName: "A1" });
    const a2 = await createUser({ slackUserId: "U_A2", displayName: "A2" });

    const t = await createTask(user.id);
    await addAssignee(t.id, a1.id, true);
    await addAssignee(t.id, a2.id, false);

    const app = buildApp(user, "user");
    const res = await req(app, "/tasks/owned");
    const body = await res.json();
    expect(body.tasks[0].progress).toEqual({ total: 2, done: 1 });
  });

  test("filters by deadline range", async () => {
    const user = await createUser();
    await createTask(user.id, {
      title: "Early",
      deadline: new Date("2026-04-10T00:00:00Z"),
    });
    await createTask(user.id, {
      title: "Mid",
      deadline: new Date("2026-04-20T00:00:00Z"),
    });

    const app = buildApp(user, "user");
    const res = await req(app, "/tasks/owned?deadlineAfter=2026-04-15T00:00:00Z");
    const body = await res.json();
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0].title).toBe("Mid");
  });
});

// ---------------------------------------------------------------------------
// GET /tasks/owned/:id/assignees
// ---------------------------------------------------------------------------

describe("GET /tasks/owned/:id/assignees", () => {
  test("returns assignee list with done status", async () => {
    const user = await createUser();
    const a1 = await createUser({ slackUserId: "U_A1", displayName: "Alice" });
    const a2 = await createUser({ slackUserId: "U_A2", displayName: "Bob" });

    const t = await createTask(user.id);
    await addAssignee(t.id, a1.id, true);
    await addAssignee(t.id, a2.id, false);

    const app = buildApp(user, "user");
    const res = await req(app, `/tasks/owned/${t.id}/assignees`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.taskId).toBe(t.id);
    expect(body.assignees).toHaveLength(2);
    expect(body.totalSize).toBe(2);
  });

  test("returns 403 for non-owner", async () => {
    const owner = await createUser();
    const nonOwner = await createUser({ slackUserId: "U_NONOWNER", displayName: "Non" });
    const t = await createTask(owner.id);

    const app = buildApp(nonOwner, "user");
    const res = await req(app, `/tasks/owned/${t.id}/assignees`);
    expect(res.status).toBe(403);
  });

  test("returns 404 for non-existent task", async () => {
    const user = await createUser();
    const app = buildApp(user, "user");
    const res = await req(app, `/tasks/owned/550e8400-e29b-41d4-a716-446655440000/assignees`);
    expect(res.status).toBe(404);
  });

  test("admin can view any task's assignees", async () => {
    const admin = await createUser({ role: "admin" });
    const owner = await createUser({ slackUserId: "U_OWNER", displayName: "Owner" });
    const t = await createTask(owner.id);
    await addAssignee(t.id, admin.id);

    const app = buildApp(admin, "admin");
    const res = await req(app, `/tasks/owned/${t.id}/assignees`);
    expect(res.status).toBe(200);
  });

  test("filters by done status", async () => {
    const user = await createUser();
    const a1 = await createUser({ slackUserId: "U_A1", displayName: "Alice" });
    const a2 = await createUser({ slackUserId: "U_A2", displayName: "Bob" });

    const t = await createTask(user.id);
    await addAssignee(t.id, a1.id, true);
    await addAssignee(t.id, a2.id, false);

    const app = buildApp(user, "user");
    const res = await req(app, `/tasks/owned/${t.id}/assignees?done=true`);
    const body = await res.json();
    expect(body.assignees).toHaveLength(1);
    expect(body.assignees[0].done).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /tasks/owned/:id/archive
// ---------------------------------------------------------------------------

describe("POST /tasks/owned/:id/archive", () => {
  test("archives a task", async () => {
    const user = await createUser();
    const t = await createTask(user.id, { archived: false });

    const app = buildApp(user, "user");
    const res = await req(app, `/tasks/owned/${t.id}/archive`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.archived).toBe(true);
  });

  test("is idempotent", async () => {
    const user = await createUser();
    const t = await createTask(user.id, { archived: true });

    const app = buildApp(user, "user");
    const res = await req(app, `/tasks/owned/${t.id}/archive`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.archived).toBe(true);
  });

  test("returns 403 for non-owner", async () => {
    const owner = await createUser();
    const nonOwner = await createUser({ slackUserId: "U_NONOWNER", displayName: "Non" });
    const t = await createTask(owner.id);

    const app = buildApp(nonOwner, "user");
    const res = await req(app, `/tasks/owned/${t.id}/archive`, { method: "POST" });
    expect(res.status).toBe(403);
  });

  test("returns 404 for non-existent task", async () => {
    const user = await createUser();
    const app = buildApp(user, "user");
    const res = await req(app, `/tasks/owned/550e8400-e29b-41d4-a716-446655440000/archive`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  test("admin can archive any task", async () => {
    const admin = await createUser({ role: "admin" });
    const owner = await createUser({ slackUserId: "U_OWNER", displayName: "Owner" });
    const t = await createTask(owner.id, { archived: false });

    const app = buildApp(admin, "admin");
    const res = await req(app, `/tasks/owned/${t.id}/archive`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.archived).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /tasks/owned/:id/unarchive
// ---------------------------------------------------------------------------

describe("POST /tasks/owned/:id/unarchive", () => {
  test("unarchives a task", async () => {
    const user = await createUser();
    const t = await createTask(user.id, { archived: true });

    const app = buildApp(user, "user");
    const res = await req(app, `/tasks/owned/${t.id}/unarchive`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.archived).toBe(false);
  });

  test("is idempotent", async () => {
    const user = await createUser();
    const t = await createTask(user.id, { archived: false });

    const app = buildApp(user, "user");
    const res = await req(app, `/tasks/owned/${t.id}/unarchive`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.archived).toBe(false);
  });

  test("returns 403 for non-owner", async () => {
    const owner = await createUser();
    const nonOwner = await createUser({ slackUserId: "U_NONOWNER", displayName: "Non" });
    const t = await createTask(owner.id, { archived: true });

    const app = buildApp(nonOwner, "user");
    const res = await req(app, `/tasks/owned/${t.id}/unarchive`, { method: "POST" });
    expect(res.status).toBe(403);
  });

  test("returns 404 for non-existent task", async () => {
    const user = await createUser();
    const app = buildApp(user, "user");
    const res = await req(app, `/tasks/owned/550e8400-e29b-41d4-a716-446655440000/unarchive`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });
});
