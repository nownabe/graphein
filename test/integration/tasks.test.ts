import { describe, test, expect, beforeEach } from "bun:test";
import { createTestApp, createTestUser, authRequest, cleanupDb } from "../helpers";

const { app, db, taskService } = createTestApp();

beforeEach(async () => {
  await cleanupDb(db);
});

describe("GET /tasks", () => {
  test("redirects to login when not authenticated", async () => {
    const res = await app.request("/tasks", {
      headers: { Origin: "http://localhost:3000" },
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/auth/login");
  });

  test("returns 200 for authenticated user", async () => {
    const user = await createTestUser(db);
    const res = await authRequest(app, user.id, "/tasks");
    expect(res.status).toBe(200);
  });

  test("shows assigned task in list", async () => {
    const user = await createTestUser(db);
    await taskService.createTask({
      title: "Integration Test Task",
      createdById: user.id,
      assigneeIds: [user.id],
    });
    const res = await authRequest(app, user.id, "/tasks");
    const html = await res.text();
    expect(html).toContain("Integration Test Task");
  });
});

describe("GET /healthz", () => {
  test("returns ok", async () => {
    const res = await app.request("/healthz", {
      headers: { Origin: "http://localhost:3000" },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});
