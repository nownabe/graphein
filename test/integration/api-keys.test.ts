import { describe, test, expect, beforeEach } from "bun:test";
import { createTestApp, createTestUser, cleanupDb } from "./helpers";

const { db, apiKeyService } = createTestApp();

beforeEach(async () => {
  await cleanupDb(db);
});

describe("createApiKey", () => {
  test("generates a key with gph_ prefix and base62 body", async () => {
    const user = await createTestUser(db);
    const result = await apiKeyService.createApiKey(user.id, "Test Key", "user");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rawKey).toMatch(/^gph_[0-9A-Za-z]+$/);
    expect(result.apiKey.keyPrefix).toBe(result.rawKey.slice(0, 12));
    expect(result.apiKey.name).toBe("Test Key");
    expect(result.apiKey.role).toBe("user");
    expect(result.apiKey.userId).toBe(user.id);
    expect(result.apiKey.revokedAt).toBeNull();
    expect(result.apiKey.expiresAt).toBeNull();
  });

  test("stores hash, not raw key", async () => {
    const user = await createTestUser(db);
    const result = await apiKeyService.createApiKey(user.id, "Test Key", "user");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The keyHash should be a 32-byte buffer (SHA-256)
    expect(result.apiKey.keyHash).toBeInstanceOf(Buffer);
    expect(result.apiKey.keyHash.length).toBe(32);
    // The hash should NOT equal the raw key
    expect(result.apiKey.keyHash.toString("utf-8")).not.toBe(result.rawKey);
  });

  test("supports optional expiresAt", async () => {
    const user = await createTestUser(db);
    const expiresAt = new Date(Date.now() + 86400 * 1000); // 1 day from now
    const result = await apiKeyService.createApiKey(user.id, "Expiring Key", "user", expiresAt);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.apiKey.expiresAt).toEqual(expiresAt);
  });

  test("supports admin role", async () => {
    const user = await createTestUser(db, { role: "admin" });
    const result = await apiKeyService.createApiKey(user.id, "Admin Key", "admin");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.apiKey.role).toBe("admin");
  });

  test("enforces 10-key-per-user limit", async () => {
    const user = await createTestUser(db);
    // Create 10 keys
    for (let i = 0; i < 10; i++) {
      const result = await apiKeyService.createApiKey(user.id, `Key ${i}`, "user");
      expect(result.ok).toBe(true);
    }
    // 11th should fail
    const result = await apiKeyService.createApiKey(user.id, "Key 10", "user");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("key_limit_exceeded");
  });

  test("revoked keys do not count toward the limit", async () => {
    const user = await createTestUser(db);
    // Create 10 keys and revoke one
    const keys: string[] = [];
    for (let i = 0; i < 10; i++) {
      const result = await apiKeyService.createApiKey(user.id, `Key ${i}`, "user");
      expect(result.ok).toBe(true);
      if (result.ok) keys.push(result.apiKey.id);
    }
    // Revoke one key
    await apiKeyService.revokeApiKey(keys[0], user.id);
    // Now we should be able to create another
    const result = await apiKeyService.createApiKey(user.id, "Key 10", "user");
    expect(result.ok).toBe(true);
  });

  test("non-admin user cannot create admin-scoped key", async () => {
    const user = await createTestUser(db, { role: "user" });
    const result = await apiKeyService.createApiKey(user.id, "Admin Key", "admin");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("admin_role_required");
  });

  test("admin user can create admin-scoped key", async () => {
    const user = await createTestUser(db, { role: "admin" });
    const result = await apiKeyService.createApiKey(user.id, "Admin Key", "admin");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.apiKey.role).toBe("admin");
  });

  test("concurrent requests respect the 10-key limit via advisory lock", async () => {
    const user = await createTestUser(db);
    // Create 9 keys first
    for (let i = 0; i < 9; i++) {
      const result = await apiKeyService.createApiKey(user.id, `Key ${i}`, "user");
      expect(result.ok).toBe(true);
    }
    // Fire two concurrent requests for the 10th slot
    const [resultA, resultB] = await Promise.all([
      apiKeyService.createApiKey(user.id, "Key 9a", "user"),
      apiKeyService.createApiKey(user.id, "Key 9b", "user"),
    ]);
    // Exactly one should succeed, one should fail
    const successes = [resultA, resultB].filter((r) => r.ok);
    const failures = [resultA, resultB].filter((r) => !r.ok);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    if (!failures[0].ok) {
      expect(failures[0].error).toBe("key_limit_exceeded");
    }
  });
});

describe("listApiKeys", () => {
  test("returns all keys for a user ordered by createdAt desc", async () => {
    const user = await createTestUser(db, { role: "admin" });
    await apiKeyService.createApiKey(user.id, "Key A", "user");
    await apiKeyService.createApiKey(user.id, "Key B", "admin");
    const list = await apiKeyService.listApiKeys(user.id);
    expect(list).toHaveLength(2);
    // Newest first
    expect(list[0].name).toBe("Key B");
    expect(list[1].name).toBe("Key A");
  });

  test("does not expose keyHash", async () => {
    const user = await createTestUser(db);
    await apiKeyService.createApiKey(user.id, "Key", "user");
    const list = await apiKeyService.listApiKeys(user.id);
    expect(list).toHaveLength(1);
    // The returned object should not have a keyHash property
    expect("keyHash" in list[0]).toBe(false);
    // But should have prefix
    expect(list[0].keyPrefix).toMatch(/^gph_/);
  });

  test("includes revoked keys", async () => {
    const user = await createTestUser(db);
    const result = await apiKeyService.createApiKey(user.id, "Revoked Key", "user");
    if (!result.ok) return;
    await apiKeyService.revokeApiKey(result.apiKey.id, user.id);
    const list = await apiKeyService.listApiKeys(user.id);
    expect(list).toHaveLength(1);
    expect(list[0].revokedAt).not.toBeNull();
  });

  test("returns empty array for user with no keys", async () => {
    const user = await createTestUser(db);
    const list = await apiKeyService.listApiKeys(user.id);
    expect(list).toEqual([]);
  });
});

describe("revokeApiKey", () => {
  test("sets revokedAt on the key", async () => {
    const user = await createTestUser(db);
    const result = await apiKeyService.createApiKey(user.id, "Key", "user");
    if (!result.ok) return;
    const revoked = await apiKeyService.revokeApiKey(result.apiKey.id, user.id);
    expect(revoked).not.toBeNull();
    expect(revoked!.revokedAt).toBeInstanceOf(Date);
  });

  test("is idempotent -- revoking again is a no-op", async () => {
    const user = await createTestUser(db);
    const result = await apiKeyService.createApiKey(user.id, "Key", "user");
    if (!result.ok) return;
    const first = await apiKeyService.revokeApiKey(result.apiKey.id, user.id);
    const second = await apiKeyService.revokeApiKey(result.apiKey.id, user.id);
    expect(second).not.toBeNull();
    // revokedAt should be the same (no-op)
    expect(second!.revokedAt!.getTime()).toBe(first!.revokedAt!.getTime());
  });

  test("returns null for non-existent key", async () => {
    const user = await createTestUser(db);
    const result = await apiKeyService.revokeApiKey(crypto.randomUUID(), user.id);
    expect(result).toBeNull();
  });

  test("returns null when user does not own the key and is not admin", async () => {
    const owner = await createTestUser(db, { slackUserId: "U_OWNER" });
    const other = await createTestUser(db, { slackUserId: "U_OTHER" });
    const result = await apiKeyService.createApiKey(owner.id, "Key", "user");
    if (!result.ok) return;
    const revoked = await apiKeyService.revokeApiKey(result.apiKey.id, other.id);
    expect(revoked).toBeNull();
  });

  test("admin can revoke another user's key", async () => {
    const owner = await createTestUser(db, { slackUserId: "U_OWNER2" });
    const admin = await createTestUser(db, { slackUserId: "U_ADMIN", role: "admin" });
    const result = await apiKeyService.createApiKey(owner.id, "Key", "user");
    if (!result.ok) return;
    const revoked = await apiKeyService.revokeApiKey(result.apiKey.id, admin.id, true);
    expect(revoked).not.toBeNull();
    expect(revoked!.revokedAt).toBeInstanceOf(Date);
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

    // Demote user to "user" role directly in DB
    const { users } = await import("../../src/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.update(users).set({ role: "user" }).where(eq(users.id, user.id));

    const verified = await apiKeyService.verifyApiKey(result.rawKey);
    expect(verified).toBeNull();

    // Verify the key was actually revoked
    const list = await apiKeyService.listApiKeys(user.id);
    expect(list[0].revokedAt).not.toBeNull();
  });

  test("updates lastUsedAt on successful verification", async () => {
    const user = await createTestUser(db);
    const result = await apiKeyService.createApiKey(user.id, "Key", "user");
    if (!result.ok) return;

    // Initially lastUsedAt is null
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
