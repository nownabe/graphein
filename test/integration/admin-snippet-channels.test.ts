import { describe, test, expect, beforeEach } from "bun:test";
import { createTestApp, createTestUser, authRequest, cleanupDb } from "./helpers";

const { app, db } = createTestApp();

beforeEach(async () => {
  await cleanupDb(db);
});

describe("GET /admin/snippet-channels", () => {
  test("requires admin auth", async () => {
    const user = await createTestUser(db, { role: "user" });
    const res = await authRequest(app, user.id, "/admin/snippet-channels");
    // Non-admin should get 403
    expect(res.status).toBe(403);
  });

  test("returns 200 for admin user", async () => {
    const admin = await createTestUser(db, { role: "admin" });
    const res = await authRequest(app, admin.id, "/admin/snippet-channels");
    expect(res.status).toBe(200);
  });
});

describe("POST /admin/snippet-channels", () => {
  test("adds a channel for admin", async () => {
    const admin = await createTestUser(db, { role: "admin" });

    const res = await authRequest(app, admin.id, "/admin/snippet-channels", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "slack_channel_id=C123TEST",
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("C123TEST");
  });

  test("non-admin gets 403", async () => {
    const user = await createTestUser(db, { role: "user" });
    const res = await authRequest(app, user.id, "/admin/snippet-channels", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "slack_channel_id=C123TEST",
    });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /admin/snippet-channels/:id", () => {
  test("removes a channel for admin", async () => {
    const admin = await createTestUser(db, { role: "admin" });

    // Add channel first
    const { snippetService } = createTestApp();
    const channel = await snippetService.addSnippetChannel("C123DEL");

    const res = await authRequest(app, admin.id, `/admin/snippet-channels/${channel!.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain("C123DEL");
  });

  test("non-admin gets 403", async () => {
    const user = await createTestUser(db, { role: "user" });
    const res = await authRequest(app, user.id, "/admin/snippet-channels/some-id", {
      method: "DELETE",
    });
    expect(res.status).toBe(403);
  });
});
