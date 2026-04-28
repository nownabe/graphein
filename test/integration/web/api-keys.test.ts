import { describe, test, expect, beforeEach } from "bun:test";
import { createTestApp, authRequest } from "../helpers/app";
import { createTestUser, cleanupDb } from "../helpers/db";

const { app, db, apiKeyService } = createTestApp();

beforeEach(async () => {
  await cleanupDb(db);
});

// ---------------------------------------------------------------------------
// HTTP route integration tests
// ---------------------------------------------------------------------------

describe("GET /settings/api-keys", () => {
  test("redirects to login when not authenticated", async () => {
    const res = await app.request("/settings/api-keys", {
      headers: { Origin: "http://localhost:3000" },
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/auth/login");
  });

  test("returns 200 for authenticated user", async () => {
    const user = await createTestUser(db);
    const res = await authRequest(app, user.id, "/settings/api-keys");
    expect(res.status).toBe(200);
  });

  test("shows created keys in the list", async () => {
    const user = await createTestUser(db);
    await apiKeyService.createApiKey(user.id, "My Test Key", "user");

    const res = await authRequest(app, user.id, "/settings/api-keys");
    const html = await res.text();
    expect(html).toContain("My Test Key");
  });

  test("shows revoked keys in the list", async () => {
    const user = await createTestUser(db);
    const result = await apiKeyService.createApiKey(user.id, "Revoked Key", "user");
    if (!result.ok) return;
    await apiKeyService.revokeApiKey(result.apiKey.id, user.id);

    const res = await authRequest(app, user.id, "/settings/api-keys");
    const html = await res.text();
    expect(html).toContain("Revoked Key");
  });

  test("does not show keys from other users", async () => {
    const user1 = await createTestUser(db, { slackUserId: "U_ONE" });
    const user2 = await createTestUser(db, { slackUserId: "U_TWO" });
    await apiKeyService.createApiKey(user1.id, "User1 Key", "user");

    const res = await authRequest(app, user2.id, "/settings/api-keys");
    const html = await res.text();
    expect(html).not.toContain("User1 Key");
  });
});

describe("POST /settings/api-keys", () => {
  test("creates a key and shows the raw key in the response", async () => {
    const user = await createTestUser(db);
    const res = await authRequest(app, user.id, "/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "name=New+Key&expiration=never",
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    // The raw key is shown in the created banner
    expect(html).toMatch(/gph_[0-9A-Za-z]+/);
    expect(html).toContain("New Key");
  });

  test("supports expiration", async () => {
    const user = await createTestUser(db);
    await authRequest(app, user.id, "/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "name=Expiring+Key&expiration=7",
    });

    const keys = await apiKeyService.listApiKeys(user.id);
    expect(keys).toHaveLength(1);
    expect(keys[0].expiresAt).not.toBeNull();
  });

  test("returns 400 for empty name", async () => {
    const user = await createTestUser(db);
    const res = await authRequest(app, user.id, "/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "name=&expiration=never",
    });
    expect(res.status).toBe(400);
  });

  test("non-admin user requesting admin role gets user role", async () => {
    const user = await createTestUser(db, { role: "user" });
    await authRequest(app, user.id, "/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "name=Admin+Attempt&expiration=never&role=admin",
    });

    const keys = await apiKeyService.listApiKeys(user.id);
    expect(keys).toHaveLength(1);
    expect(keys[0].role).toBe("user");
  });

  test("admin user can create admin-scoped key", async () => {
    const user = await createTestUser(db, { role: "admin" });
    await authRequest(app, user.id, "/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "name=Admin+Key&expiration=never&role=admin",
    });

    const keys = await apiKeyService.listApiKeys(user.id);
    expect(keys).toHaveLength(1);
    expect(keys[0].role).toBe("admin");
  });

  test("shows error when 10-key limit is exceeded", async () => {
    const user = await createTestUser(db);
    for (let i = 0; i < 10; i++) {
      await apiKeyService.createApiKey(user.id, `Key ${i}`, "user");
    }

    const res = await authRequest(app, user.id, "/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "name=Overflow+Key&expiration=never",
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("at most 10 active API keys");
  });

  test("revoked keys do not count toward the limit", async () => {
    const user = await createTestUser(db);
    const keys: string[] = [];
    for (let i = 0; i < 10; i++) {
      const result = await apiKeyService.createApiKey(user.id, `Key ${i}`, "user");
      if (result.ok) keys.push(result.apiKey.id);
    }
    await apiKeyService.revokeApiKey(keys[0], user.id);

    const res = await authRequest(app, user.id, "/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "name=After+Revoke&expiration=never",
    });
    const html = await res.text();
    expect(html).toMatch(/gph_[0-9A-Za-z]+/);
    expect(html).toContain("After Revoke");
  });
});

describe("POST /settings/api-keys/:id/revoke", () => {
  test("revokes a key and shows updated list", async () => {
    const user = await createTestUser(db);
    const result = await apiKeyService.createApiKey(user.id, "To Revoke", "user");
    if (!result.ok) return;

    const res = await authRequest(app, user.id, `/settings/api-keys/${result.apiKey.id}/revoke`, {
      method: "POST",
    });
    expect(res.status).toBe(200);

    const keys = await apiKeyService.listApiKeys(user.id);
    expect(keys[0].revokedAt).not.toBeNull();
  });

  test("non-owner cannot revoke another user's key", async () => {
    const owner = await createTestUser(db, { slackUserId: "U_OWNER" });
    const other = await createTestUser(db, { slackUserId: "U_OTHER" });
    const result = await apiKeyService.createApiKey(owner.id, "Owner Key", "user");
    if (!result.ok) return;

    await authRequest(app, other.id, `/settings/api-keys/${result.apiKey.id}/revoke`, {
      method: "POST",
    });

    // Key should NOT be revoked
    const keys = await apiKeyService.listApiKeys(owner.id);
    expect(keys[0].revokedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Service-level tests (no HTTP route equivalent)
// ---------------------------------------------------------------------------

describe("createApiKey (service internals)", () => {
  test("generates a key with gph_ prefix and base62 body", async () => {
    const user = await createTestUser(db);
    const result = await apiKeyService.createApiKey(user.id, "Test Key", "user");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rawKey).toMatch(/^gph_[0-9A-Za-z]+$/);
    expect(result.apiKey.keyPrefix).toBe(result.rawKey.slice(0, 12));
  });

  test("stores hash, not raw key", async () => {
    const user = await createTestUser(db);
    const result = await apiKeyService.createApiKey(user.id, "Test Key", "user");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.apiKey.keyHash).toBeInstanceOf(Buffer);
    expect(result.apiKey.keyHash.length).toBe(32);
    expect(result.apiKey.keyHash.toString("utf-8")).not.toBe(result.rawKey);
  });

  test("concurrent requests respect the 10-key limit via advisory lock", async () => {
    const user = await createTestUser(db);
    for (let i = 0; i < 9; i++) {
      await apiKeyService.createApiKey(user.id, `Key ${i}`, "user");
    }
    const [resultA, resultB] = await Promise.all([
      apiKeyService.createApiKey(user.id, "Key 9a", "user"),
      apiKeyService.createApiKey(user.id, "Key 9b", "user"),
    ]);
    const successes = [resultA, resultB].filter((r) => r.ok);
    const failures = [resultA, resultB].filter((r) => !r.ok);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    if (!failures[0].ok) {
      expect(failures[0].error).toBe("key_limit_exceeded");
    }
  });
});

describe("verifyApiKey", () => {
  test("returns user and role for valid key", async () => {
    const user = await createTestUser(db);
    const result = await apiKeyService.createApiKey(user.id, "Key", "user");
    if (!result.ok) return;
    const verified = await apiKeyService.verifyApiKey(result.rawKey);
    expect(verified).not.toBeNull();
    expect(verified!.user.id).toBe(user.id);
    expect(verified!.role).toBe("user");
  });

  test("returns null for unknown key", async () => {
    const verified = await apiKeyService.verifyApiKey("gph_nonexistentkey12345");
    expect(verified).toBeNull();
  });

  test("returns null for revoked key", async () => {
    const user = await createTestUser(db);
    const result = await apiKeyService.createApiKey(user.id, "Key", "user");
    if (!result.ok) return;
    await apiKeyService.revokeApiKey(result.apiKey.id, user.id);
    const verified = await apiKeyService.verifyApiKey(result.rawKey);
    expect(verified).toBeNull();
  });

  test("returns null for expired key", async () => {
    const user = await createTestUser(db);
    const pastDate = new Date(Date.now() - 1000);
    const result = await apiKeyService.createApiKey(user.id, "Expired Key", "user", pastDate);
    if (!result.ok) return;
    const verified = await apiKeyService.verifyApiKey(result.rawKey);
    expect(verified).toBeNull();
  });

  test("auto-revokes admin key held by demoted user and returns null", async () => {
    const user = await createTestUser(db, { role: "admin" });
    const result = await apiKeyService.createApiKey(user.id, "Admin Key", "admin");
    if (!result.ok) return;

    const { users } = await import("../../../src/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.update(users).set({ role: "user" }).where(eq(users.id, user.id));

    const verified = await apiKeyService.verifyApiKey(result.rawKey);
    expect(verified).toBeNull();

    const list = await apiKeyService.listApiKeys(user.id);
    expect(list[0].revokedAt).not.toBeNull();
  });

  test("updates lastUsedAt on successful verification", async () => {
    const user = await createTestUser(db);
    const result = await apiKeyService.createApiKey(user.id, "Key", "user");
    if (!result.ok) return;

    const listBefore = await apiKeyService.listApiKeys(user.id);
    expect(listBefore[0].lastUsedAt).toBeNull();

    await apiKeyService.verifyApiKey(result.rawKey);

    const listAfter = await apiKeyService.listApiKeys(user.id);
    expect(listAfter[0].lastUsedAt).not.toBeNull();
  });

  test("admin user with user-role key proceeds as user", async () => {
    const user = await createTestUser(db, { role: "admin" });
    const result = await apiKeyService.createApiKey(user.id, "User Key", "user");
    if (!result.ok) return;
    const verified = await apiKeyService.verifyApiKey(result.rawKey);
    expect(verified).not.toBeNull();
    expect(verified!.role).toBe("user");
  });

  test("admin user with admin-role key proceeds as admin", async () => {
    const user = await createTestUser(db, { role: "admin" });
    const result = await apiKeyService.createApiKey(user.id, "Admin Key", "admin");
    if (!result.ok) return;
    const verified = await apiKeyService.verifyApiKey(result.rawKey);
    expect(verified).not.toBeNull();
    expect(verified!.role).toBe("admin");
  });
});
