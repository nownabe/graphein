import { eq, and, isNull, desc, sql } from "drizzle-orm";
import type { Database } from "../../infrastructure/db/client";
import { apiKeys, users } from "../../infrastructure/db/schema";

/** Maximum number of active (non-revoked) keys per user. */
const MAX_ACTIVE_KEYS_PER_USER = 10;

/** Base62 alphabet for key encoding. */
const BASE62_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Encode a byte array as a base62 string. */
function encodeBase62(bytes: Uint8Array): string {
  // Convert bytes to a BigInt
  let num = 0n;
  for (const byte of bytes) {
    num = (num << 8n) | BigInt(byte);
  }

  if (num === 0n) return "0";

  const chars: string[] = [];
  while (num > 0n) {
    chars.unshift(BASE62_CHARS[Number(num % 62n)]);
    num = num / 62n;
  }
  return chars.join("");
}

/** Generate a raw API key with the `gph_` prefix. */
function generateRawKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `gph_${encodeBase62(bytes)}`;
}

/** Compute SHA-256 hash of a raw key and return as a Buffer. */
async function hashKey(rawKey: string): Promise<Buffer> {
  const data = new TextEncoder().encode(rawKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(hashBuffer);
}

export type ApiKeyRole = "user" | "admin";

export type CreateApiKeyResult =
  | { ok: true; rawKey: string; apiKey: typeof apiKeys.$inferSelect }
  | { ok: false; error: "key_limit_exceeded" | "admin_role_required" };

export function createApiKeyService(db: Database) {
  /**
   * Create a new API key for a user.
   *
   * Generates a cryptographically random key, hashes it, and stores the hash.
   * The raw key is returned once and must never be stored server-side.
   *
   * Enforces:
   * - Role validation: non-admin users cannot create admin-scoped keys.
   * - Per-user limit of 10 active (non-revoked) keys, using a transaction
   *   with an advisory lock to prevent concurrent requests from exceeding it.
   */
  async function createApiKey(
    userId: string,
    name: string,
    role: ApiKeyRole,
    expiresAt?: Date,
  ): Promise<CreateApiKeyResult> {
    // Validate role: only admins can create admin-scoped keys
    if (role === "admin") {
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { role: true },
      });
      if (!user || user.role !== "admin") {
        return { ok: false, error: "admin_role_required" };
      }
    }

    const rawKey = generateRawKey();
    const keyHash = await hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, 12);

    // Use a transaction with an advisory lock to prevent concurrent requests
    // from both passing the count check and exceeding the per-user limit.
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('api_key_limit'), hashtext(${userId}))`,
      );

      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(apiKeys)
        .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));

      if (count >= MAX_ACTIVE_KEYS_PER_USER) {
        return { ok: false as const, error: "key_limit_exceeded" as const };
      }

      const [apiKey] = await tx
        .insert(apiKeys)
        .values({
          userId,
          name,
          keyHash,
          keyPrefix,
          role,
          expiresAt: expiresAt ?? null,
        })
        .returning();

      return { ok: true as const, rawKey, apiKey };
    });

    return result;
  }

  /**
   * List all API keys for a user, ordered by creation date (newest first).
   *
   * Never returns the key hash -- only the prefix, name, role, and dates.
   */
  async function listApiKeys(userId: string) {
    const rows = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        role: apiKeys.role,
        expiresAt: apiKeys.expiresAt,
        lastUsedAt: apiKeys.lastUsedAt,
        revokedAt: apiKeys.revokedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId))
      .orderBy(desc(apiKeys.createdAt));

    return rows;
  }

  /**
   * Revoke an API key by setting `revokedAt` to the current time.
   *
   * Verifies that the key belongs to the requesting user, or the user is an admin.
   * Idempotent -- revoking an already-revoked key is a no-op.
   */
  async function revokeApiKey(keyId: string, userId: string, isAdmin = false) {
    const key = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.id, keyId),
    });

    if (!key) return null;

    // Only the key owner or an admin can revoke
    if (key.userId !== userId && !isAdmin) return null;

    // Already revoked -- no-op
    if (key.revokedAt) return key;

    const [updated] = await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, keyId))
      .returning();

    return updated;
  }

  /**
   * Verify a raw API key and return the associated user and effective role.
   *
   * Checks:
   * 1. Hash matches a stored key
   * 2. Key is not revoked
   * 3. Key is not expired
   * 4. Role consistency: if user was demoted from admin to user but holds
   *    an admin key, auto-revoke the key and return null.
   *
   * On success, updates `lastUsedAt` and returns the user + effective role.
   */
  async function verifyApiKey(
    rawKey: string,
  ): Promise<{ user: typeof users.$inferSelect; role: ApiKeyRole } | null> {
    const keyHash = await hashKey(rawKey);

    const key = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.keyHash, keyHash),
      with: { user: true },
    });

    if (!key) return null;

    // Key is revoked
    if (key.revokedAt) return null;

    // Key is expired
    if (key.expiresAt && key.expiresAt <= new Date()) return null;

    // Role consistency check: user was demoted but holds an admin key
    if (key.role === "admin" && key.user.role !== "admin") {
      // Auto-revoke the admin key
      await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, key.id));
      return null;
    }

    // Update lastUsedAt (fire-and-forget is fine; we don't need to wait)
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));

    // Effective role is the key's role (which may be lower than the user's role)
    const effectiveRole = key.role as ApiKeyRole;

    return { user: key.user, role: effectiveRole };
  }

  return {
    createApiKey,
    listApiKeys,
    revokeApiKey,
    verifyApiKey,
  };
}

export type ApiKeyService = ReturnType<typeof createApiKeyService>;
