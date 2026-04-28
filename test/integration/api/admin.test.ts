import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createDb } from "../../../src/db/client";
import { createAdminApiRoutes } from "../../../src/api/admin";
import { createUserService } from "../../../src/users/service";
import { createSnippetService } from "../../../src/snippets/service";
import { createKudosService } from "../../../src/kudos/service";
import { snippetChannels, kudosChannels } from "../../../src/db/schema";
import { TEST_DATABASE_URL } from "../helpers/setup";
import { cleanupDb } from "../helpers/db";
import { createUser, buildApiApp, apiRequest } from "../helpers/api";

const db = createDb(TEST_DATABASE_URL, { max: 2 });
const userService = createUserService(db);
const snippetService = createSnippetService(db);
const kudosService = createKudosService(db);

function buildApp(
  mockUser: Awaited<ReturnType<typeof createUser>>,
  role: "user" | "admin" = "admin",
) {
  const adminRoutes = createAdminApiRoutes({ userService, snippetService, kudosService, db });
  return buildApiApp(mockUser, role, adminRoutes);
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

// ===========================================================================
// GET /admin/users
// ===========================================================================

describe("GET /admin/users", () => {
  test("returns paginated list of users", async () => {
    const admin = await createUser({ role: "admin", displayName: "Admin" });
    await createUser({ displayName: "Alice", email: "alice@example.com" });
    await createUser({ displayName: "Bob", email: "bob@example.com" });

    const app = buildApp(admin);
    const res = await apiRequest(app, "/admin/users");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.users).toHaveLength(3);
    expect(body.totalSize).toBe(3);
  });

  test("filters users by search query on displayName", async () => {
    const admin = await createUser({ role: "admin", displayName: "Admin" });
    await createUser({ displayName: "Alice", email: "alice@example.com" });
    await createUser({ displayName: "Bob", email: "bob@example.com" });

    const app = buildApp(admin);
    const res = await apiRequest(app, "/admin/users?query=alice");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.users).toHaveLength(1);
    expect(body.users[0].displayName).toBe("Alice");
    expect(body.totalSize).toBe(1);
  });

  test("filters users by search query on email", async () => {
    const admin = await createUser({ role: "admin", displayName: "Admin" });
    await createUser({ displayName: "Alice", email: "alice@example.com" });
    await createUser({ displayName: "Bob", email: "bob@test.com" });

    const app = buildApp(admin);
    const res = await apiRequest(app, "/admin/users?query=test.com");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.users).toHaveLength(1);
    expect(body.users[0].displayName).toBe("Bob");
  });

  test("paginates with pageSize and pageToken", async () => {
    const admin = await createUser({ role: "admin", displayName: "Admin" });
    // Create users with names that sort predictably
    await createUser({ displayName: "Alice", email: "a@example.com" });
    await createUser({ displayName: "Bob", email: "b@example.com" });
    await createUser({ displayName: "Charlie", email: "c@example.com" });

    const app = buildApp(admin);

    // First page
    const res1 = await apiRequest(app, "/admin/users?pageSize=2");
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.users).toHaveLength(2);
    expect(body1.totalSize).toBe(4);
    expect(body1.nextPageToken).not.toBe("");

    // Second page
    const res2 = await apiRequest(app, `/admin/users?pageSize=2&pageToken=${body1.nextPageToken}`);
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.users).toHaveLength(2);

    // All four names should be present across both pages
    const allNames = [...body1.users, ...body2.users].map((u: any) => u.displayName);
    expect(allNames).toContain("Admin");
    expect(allNames).toContain("Alice");
    expect(allNames).toContain("Bob");
    expect(allNames).toContain("Charlie");
  });

  test("returns empty nextPageToken when no more results", async () => {
    const admin = await createUser({ role: "admin", displayName: "Admin" });

    const app = buildApp(admin);
    const res = await apiRequest(app, "/admin/users?pageSize=50");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.nextPageToken).toBe("");
  });

  test("rejects invalid pageToken", async () => {
    const admin = await createUser({ role: "admin", displayName: "Admin" });

    const app = buildApp(admin);
    const res = await apiRequest(app, "/admin/users?pageToken=invalidtoken");
    expect(res.status).toBe(422);

    const body = await res.json();
    expect(body.error.code).toBe("validation_error");
  });

  test("rejects invalid pageSize", async () => {
    const admin = await createUser({ role: "admin", displayName: "Admin" });

    const app = buildApp(admin);
    const res = await apiRequest(app, "/admin/users?pageSize=-1");
    expect(res.status).toBe(422);
  });

  test("returns 403 for non-admin users", async () => {
    const user = await createUser({ role: "user" });

    const app = buildApp(user, "user");
    const res = await apiRequest(app, "/admin/users");
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error.code).toBe("forbidden");
  });

  test("returns users sorted by displayName ascending", async () => {
    const admin = await createUser({ role: "admin", displayName: "Zara" });
    await createUser({ displayName: "Alice", email: "a@example.com" });
    await createUser({ displayName: "Middle", email: "m@example.com" });

    const app = buildApp(admin);
    const res = await apiRequest(app, "/admin/users");
    expect(res.status).toBe(200);

    const body = await res.json();
    const names = body.users.map((u: any) => u.displayName);
    expect(names).toEqual(["Alice", "Middle", "Zara"]);
  });
});

// ===========================================================================
// POST /admin/users/:id/deactivate
// ===========================================================================

describe("POST /admin/users/{id}/deactivate", () => {
  test("deactivates a user", async () => {
    const admin = await createUser({ role: "admin", displayName: "Admin" });
    const target = await createUser({ displayName: "Target", email: "target@example.com" });

    const app = buildApp(admin);
    const res = await apiRequest(app, `/admin/users/${target.id}/deactivate`, { method: "POST" });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.id).toBe(target.id);
    expect(body.displayName).toBe("Target");
    expect(body.deactivatedAt).toBeTruthy();
  });

  test("is idempotent — deactivating already-deactivated user returns 200", async () => {
    const admin = await createUser({ role: "admin", displayName: "Admin" });
    const target = await createUser({ displayName: "Target", email: "target@example.com" });

    const app = buildApp(admin);

    // First deactivation
    const res1 = await apiRequest(app, `/admin/users/${target.id}/deactivate`, { method: "POST" });
    expect(res1.status).toBe(200);
    const body1 = await res1.json();

    // Second deactivation — idempotent
    const res2 = await apiRequest(app, `/admin/users/${target.id}/deactivate`, { method: "POST" });
    expect(res2.status).toBe(200);
    const body2 = await res2.json();

    expect(body2.deactivatedAt).toBe(body1.deactivatedAt);
  });

  test("returns 422 when trying to deactivate yourself", async () => {
    const admin = await createUser({ role: "admin", displayName: "Admin" });

    const app = buildApp(admin);
    const res = await apiRequest(app, `/admin/users/${admin.id}/deactivate`, { method: "POST" });
    expect(res.status).toBe(422);

    const body = await res.json();
    expect(body.error.code).toBe("validation_error");
  });

  test("returns 404 for non-existent user", async () => {
    const admin = await createUser({ role: "admin", displayName: "Admin" });

    const app = buildApp(admin);
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await apiRequest(app, `/admin/users/${fakeId}/deactivate`, { method: "POST" });
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error.code).toBe("not_found");
  });

  test("returns 403 for non-admin users", async () => {
    const user = await createUser({ role: "user" });
    const target = await createUser({ displayName: "Target", email: "target@example.com" });

    const app = buildApp(user, "user");
    const res = await apiRequest(app, `/admin/users/${target.id}/deactivate`, { method: "POST" });
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error.code).toBe("forbidden");
  });

  test("returns 422 for invalid UUID", async () => {
    const admin = await createUser({ role: "admin", displayName: "Admin" });

    const app = buildApp(admin);
    const res = await apiRequest(app, "/admin/users/not-a-uuid/deactivate", { method: "POST" });
    expect(res.status).toBe(422);
  });
});

// ===========================================================================
// GET /admin/snippetChannels
// ===========================================================================

describe("GET /admin/snippetChannels", () => {
  test("returns list of snippet channels", async () => {
    const admin = await createUser({ role: "admin" });
    await db.insert(snippetChannels).values({ slackChannelId: "C_SNIP1" });
    await db.insert(snippetChannels).values({ slackChannelId: "C_SNIP2" });

    const app = buildApp(admin);
    const res = await apiRequest(app, "/admin/snippetChannels");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.snippetChannels).toHaveLength(2);
    expect(body.snippetChannels[0]).toHaveProperty("id");
    expect(body.snippetChannels[0]).toHaveProperty("slackChannelId");
    expect(body.snippetChannels[0]).toHaveProperty("createdAt");
  });

  test("returns empty array when no channels exist", async () => {
    const admin = await createUser({ role: "admin" });

    const app = buildApp(admin);
    const res = await apiRequest(app, "/admin/snippetChannels");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.snippetChannels).toHaveLength(0);
  });

  test("returns 403 for non-admin users", async () => {
    const user = await createUser({ role: "user" });

    const app = buildApp(user, "user");
    const res = await apiRequest(app, "/admin/snippetChannels");
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// POST /admin/snippetChannels
// ===========================================================================

describe("POST /admin/snippetChannels", () => {
  test("creates a new snippet channel and returns 201", async () => {
    const admin = await createUser({ role: "admin" });

    const app = buildApp(admin);
    const res = await apiRequest(app, "/admin/snippetChannels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slackChannelId: "C_NEW_SNIP" }),
    });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.slackChannelId).toBe("C_NEW_SNIP");
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("createdAt");
  });

  test("is idempotent — returns 200 for existing channel", async () => {
    const admin = await createUser({ role: "admin" });
    await db.insert(snippetChannels).values({ slackChannelId: "C_EXISTING" });

    const app = buildApp(admin);
    const res = await apiRequest(app, "/admin/snippetChannels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slackChannelId: "C_EXISTING" }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.slackChannelId).toBe("C_EXISTING");
  });

  test("returns 422 for missing slackChannelId", async () => {
    const admin = await createUser({ role: "admin" });

    const app = buildApp(admin);
    const res = await apiRequest(app, "/admin/snippetChannels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);

    const body = await res.json();
    expect(body.error.code).toBe("validation_error");
  });

  test("returns 422 for empty slackChannelId", async () => {
    const admin = await createUser({ role: "admin" });

    const app = buildApp(admin);
    const res = await apiRequest(app, "/admin/snippetChannels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slackChannelId: "" }),
    });
    expect(res.status).toBe(422);
  });

  test("returns 403 for non-admin users", async () => {
    const user = await createUser({ role: "user" });

    const app = buildApp(user, "user");
    const res = await apiRequest(app, "/admin/snippetChannels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slackChannelId: "C_SNIP" }),
    });
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// DELETE /admin/snippetChannels/:id
// ===========================================================================

describe("DELETE /admin/snippetChannels/{id}", () => {
  test("deletes a snippet channel and returns 204", async () => {
    const admin = await createUser({ role: "admin" });
    const [channel] = await db
      .insert(snippetChannels)
      .values({ slackChannelId: "C_DEL_SNIP" })
      .returning();

    const app = buildApp(admin);
    const res = await apiRequest(app, `/admin/snippetChannels/${channel.id}`, { method: "DELETE" });
    expect(res.status).toBe(204);

    // Verify it's gone
    const listRes = await apiRequest(app, "/admin/snippetChannels");
    const body = await listRes.json();
    expect(body.snippetChannels).toHaveLength(0);
  });

  test("returns 404 for non-existent channel", async () => {
    const admin = await createUser({ role: "admin" });

    const app = buildApp(admin);
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await apiRequest(app, `/admin/snippetChannels/${fakeId}`, { method: "DELETE" });
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error.code).toBe("not_found");
  });

  test("returns 403 for non-admin users", async () => {
    const user = await createUser({ role: "user" });
    const [channel] = await db
      .insert(snippetChannels)
      .values({ slackChannelId: "C_SNIP" })
      .returning();

    const app = buildApp(user, "user");
    const res = await apiRequest(app, `/admin/snippetChannels/${channel.id}`, { method: "DELETE" });
    expect(res.status).toBe(403);
  });

  test("returns 422 for invalid UUID", async () => {
    const admin = await createUser({ role: "admin" });

    const app = buildApp(admin);
    const res = await apiRequest(app, "/admin/snippetChannels/not-a-uuid", { method: "DELETE" });
    expect(res.status).toBe(422);
  });
});

// ===========================================================================
// GET /admin/kudosChannels
// ===========================================================================

describe("GET /admin/kudosChannels", () => {
  test("returns list of kudos channels", async () => {
    const admin = await createUser({ role: "admin" });
    await db.insert(kudosChannels).values({ slackChannelId: "C_KUDOS1" });
    await db.insert(kudosChannels).values({ slackChannelId: "C_KUDOS2" });

    const app = buildApp(admin);
    const res = await apiRequest(app, "/admin/kudosChannels");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.kudosChannels).toHaveLength(2);
    expect(body.kudosChannels[0]).toHaveProperty("id");
    expect(body.kudosChannels[0]).toHaveProperty("slackChannelId");
    expect(body.kudosChannels[0]).toHaveProperty("createdAt");
  });

  test("returns empty array when no channels exist", async () => {
    const admin = await createUser({ role: "admin" });

    const app = buildApp(admin);
    const res = await apiRequest(app, "/admin/kudosChannels");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.kudosChannels).toHaveLength(0);
  });

  test("returns 403 for non-admin users", async () => {
    const user = await createUser({ role: "user" });

    const app = buildApp(user, "user");
    const res = await apiRequest(app, "/admin/kudosChannels");
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// POST /admin/kudosChannels
// ===========================================================================

describe("POST /admin/kudosChannels", () => {
  test("creates a new kudos channel and returns 201", async () => {
    const admin = await createUser({ role: "admin" });

    const app = buildApp(admin);
    const res = await apiRequest(app, "/admin/kudosChannels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slackChannelId: "C_NEW_KUDOS" }),
    });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.slackChannelId).toBe("C_NEW_KUDOS");
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("createdAt");
  });

  test("is idempotent — returns 200 for existing channel", async () => {
    const admin = await createUser({ role: "admin" });
    await db.insert(kudosChannels).values({ slackChannelId: "C_EXISTING_K" });

    const app = buildApp(admin);
    const res = await apiRequest(app, "/admin/kudosChannels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slackChannelId: "C_EXISTING_K" }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.slackChannelId).toBe("C_EXISTING_K");
  });

  test("returns 422 for missing slackChannelId", async () => {
    const admin = await createUser({ role: "admin" });

    const app = buildApp(admin);
    const res = await apiRequest(app, "/admin/kudosChannels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);

    const body = await res.json();
    expect(body.error.code).toBe("validation_error");
  });

  test("returns 422 for empty slackChannelId", async () => {
    const admin = await createUser({ role: "admin" });

    const app = buildApp(admin);
    const res = await apiRequest(app, "/admin/kudosChannels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slackChannelId: "" }),
    });
    expect(res.status).toBe(422);
  });

  test("returns 403 for non-admin users", async () => {
    const user = await createUser({ role: "user" });

    const app = buildApp(user, "user");
    const res = await apiRequest(app, "/admin/kudosChannels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slackChannelId: "C_KUDOS" }),
    });
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// DELETE /admin/kudosChannels/:id
// ===========================================================================

describe("DELETE /admin/kudosChannels/{id}", () => {
  test("deletes a kudos channel and returns 204", async () => {
    const admin = await createUser({ role: "admin" });
    const [channel] = await db
      .insert(kudosChannels)
      .values({ slackChannelId: "C_DEL_KUDOS" })
      .returning();

    const app = buildApp(admin);
    const res = await apiRequest(app, `/admin/kudosChannels/${channel.id}`, { method: "DELETE" });
    expect(res.status).toBe(204);

    // Verify it's gone
    const listRes = await apiRequest(app, "/admin/kudosChannels");
    const body = await listRes.json();
    expect(body.kudosChannels).toHaveLength(0);
  });

  test("returns 404 for non-existent channel", async () => {
    const admin = await createUser({ role: "admin" });

    const app = buildApp(admin);
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await apiRequest(app, `/admin/kudosChannels/${fakeId}`, { method: "DELETE" });
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error.code).toBe("not_found");
  });

  test("returns 403 for non-admin users", async () => {
    const user = await createUser({ role: "user" });
    const [channel] = await db
      .insert(kudosChannels)
      .values({ slackChannelId: "C_KUDOS" })
      .returning();

    const app = buildApp(user, "user");
    const res = await apiRequest(app, `/admin/kudosChannels/${channel.id}`, { method: "DELETE" });
    expect(res.status).toBe(403);
  });

  test("returns 422 for invalid UUID", async () => {
    const admin = await createUser({ role: "admin" });

    const app = buildApp(admin);
    const res = await apiRequest(app, "/admin/kudosChannels/not-a-uuid", { method: "DELETE" });
    expect(res.status).toBe(422);
  });
});
