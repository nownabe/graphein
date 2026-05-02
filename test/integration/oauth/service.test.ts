import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb } from "../../../src/db/client";
import { oauthClients, oauthAuthorizationCodes, oauthRefreshTokens } from "../../../src/db/schema";
import { createOAuthService } from "../../../src/oauth/service";
import { createTestUser, cleanupDb } from "../helpers/db";
import { TEST_DATABASE_URL } from "../helpers/setup";

const db = createDb(TEST_DATABASE_URL, { max: 1 });
const oauth = createOAuthService(db);

beforeEach(async () => {
  await cleanupDb(db);
});

afterEach(async () => {
  await cleanupDb(db);
});

describe("registerClient", () => {
  test("registers a public client with no secret", async () => {
    const result = await oauth.registerClient({
      clientName: "Public App",
      redirectUris: ["https://example.com/cb"],
      tokenEndpointAuthMethod: "none",
    });

    expect(result.clientSecret).toBeNull();
    expect(result.clientName).toBe("Public App");
    expect(result.redirectUris).toEqual(["https://example.com/cb"]);
    expect(result.grantTypes).toEqual(["authorization_code"]);

    // Verify DB record has no secret hash
    const stored = await db.query.oauthClients.findFirst({
      where: eq(oauthClients.clientId, result.clientId),
    });
    expect(stored).toBeDefined();
    expect(stored!.clientSecretHash).toBeNull();
  });

  test("registers a confidential client with a hashed secret", async () => {
    const result = await oauth.registerClient({
      clientName: "Confidential App",
      redirectUris: ["https://example.com/cb"],
    });

    // Raw secret is returned once
    expect(result.clientSecret).not.toBeNull();
    expect(typeof result.clientSecret).toBe("string");
    expect(result.clientSecret!.length).toBeGreaterThan(0);

    // DB stores the hash, not the raw secret
    const stored = await db.query.oauthClients.findFirst({
      where: eq(oauthClients.clientId, result.clientId),
    });
    expect(stored).toBeDefined();
    expect(stored!.clientSecretHash).not.toBeNull();
    expect(Buffer.isBuffer(stored!.clientSecretHash)).toBe(true);
    // The hash should NOT equal the raw secret bytes
    expect(stored!.clientSecretHash!.toString("utf-8")).not.toBe(result.clientSecret);
  });

  test("stores custom grant types", async () => {
    const result = await oauth.registerClient({
      clientName: "Custom Grants",
      redirectUris: ["https://example.com/cb"],
      grantTypes: ["authorization_code", "refresh_token"],
      tokenEndpointAuthMethod: "none",
    });

    expect(result.grantTypes).toEqual(["authorization_code", "refresh_token"]);
  });
});

describe("getClient", () => {
  test("returns undefined for unknown client", async () => {
    const result = await oauth.getClient("nonexistent");
    expect(result).toBeUndefined();
  });

  test("returns registered client", async () => {
    const registered = await oauth.registerClient({
      clientName: "Lookup Test",
      redirectUris: ["https://example.com/cb"],
      tokenEndpointAuthMethod: "none",
    });

    const result = await oauth.getClient(registered.clientId);
    expect(result).toBeDefined();
    expect(result!.clientName).toBe("Lookup Test");
    expect(result!.clientId).toBe(registered.clientId);
  });
});

describe("authorization codes", () => {
  test("creates and consumes a code with challenge metadata", async () => {
    const user = await createTestUser(db);

    const code = await oauth.createAuthorizationCode({
      clientId: "test-client",
      userId: user.id,
      redirectUri: "https://example.com/cb",
      scope: "graphein",
      resource: "https://graphein.example.com/mcp",
      codeChallenge: "challenge123",
      codeChallengeMethod: "S256",
    });

    expect(typeof code).toBe("string");
    expect(code.length).toBeGreaterThan(0);

    const consumed = await oauth.consumeAuthorizationCode(code);
    expect(consumed).not.toBeNull();
    expect(consumed!.clientId).toBe("test-client");
    expect(consumed!.userId).toBe(user.id);
    expect(consumed!.redirectUri).toBe("https://example.com/cb");
    expect(consumed!.scope).toBe("graphein");
    expect(consumed!.resource).toBe("https://graphein.example.com/mcp");
    expect(consumed!.codeChallenge).toBe("challenge123");
    expect(consumed!.codeChallengeMethod).toBe("S256");
  });

  test("code can only be consumed once (single-use)", async () => {
    const user = await createTestUser(db);

    const code = await oauth.createAuthorizationCode({
      clientId: "test-client",
      userId: user.id,
      redirectUri: "https://example.com/cb",
      scope: "graphein",
      resource: "https://graphein.example.com/mcp",
      codeChallenge: "challenge",
    });

    const first = await oauth.consumeAuthorizationCode(code);
    expect(first).not.toBeNull();

    const second = await oauth.consumeAuthorizationCode(code);
    expect(second).toBeNull();
  });

  test("expired code cannot be consumed", async () => {
    const user = await createTestUser(db);

    const code = await oauth.createAuthorizationCode({
      clientId: "test-client",
      userId: user.id,
      redirectUri: "https://example.com/cb",
      scope: "graphein",
      resource: "https://graphein.example.com/mcp",
      codeChallenge: "challenge",
    });

    // Manually expire the code
    await db
      .update(oauthAuthorizationCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(oauthAuthorizationCodes.code, code));

    const result = await oauth.consumeAuthorizationCode(code);
    expect(result).toBeNull();
  });

  test("getCodeChallenge returns challenge for valid code", async () => {
    const user = await createTestUser(db);

    const code = await oauth.createAuthorizationCode({
      clientId: "test-client",
      userId: user.id,
      redirectUri: "https://example.com/cb",
      scope: "graphein",
      resource: "https://graphein.example.com/mcp",
      codeChallenge: "my-challenge",
      codeChallengeMethod: "S256",
    });

    const challenge = await oauth.getCodeChallenge(code);
    expect(challenge).not.toBeNull();
    expect(challenge!.codeChallenge).toBe("my-challenge");
    expect(challenge!.codeChallengeMethod).toBe("S256");
  });

  test("getCodeChallenge returns null for unknown code", async () => {
    const result = await oauth.getCodeChallenge("nonexistent-code");
    expect(result).toBeNull();
  });
});

describe("refresh tokens", () => {
  test("creates token and stores it hashed", async () => {
    const user = await createTestUser(db);

    const rawToken = await oauth.createRefreshToken({
      clientId: "test-client",
      userId: user.id,
      scope: "graphein",
      resource: "https://graphein.example.com/mcp",
    });

    expect(typeof rawToken).toBe("string");
    expect(rawToken.length).toBeGreaterThan(0);

    // Raw token must not appear in storage
    const allTokens = await db.select().from(oauthRefreshTokens);
    expect(allTokens).toHaveLength(1);
    expect(allTokens[0].tokenHash).not.toBe(rawToken);
    // Token hash is a hex string (SHA-256 = 64 hex chars)
    expect(allTokens[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("consumes a valid refresh token and returns metadata", async () => {
    const user = await createTestUser(db);

    const rawToken = await oauth.createRefreshToken({
      clientId: "test-client",
      userId: user.id,
      scope: "graphein",
      resource: "https://graphein.example.com/mcp",
    });

    const result = await oauth.consumeRefreshToken(
      rawToken,
      "test-client",
      "https://graphein.example.com/mcp",
    );

    expect(result).not.toBeNull();
    expect(result!.clientId).toBe("test-client");
    expect(result!.userId).toBe(user.id);
    expect(result!.scope).toBe("graphein");
    expect(result!.resource).toBe("https://graphein.example.com/mcp");
  });

  test("consuming a token revokes it (rotation)", async () => {
    const user = await createTestUser(db);

    const rawToken = await oauth.createRefreshToken({
      clientId: "test-client",
      userId: user.id,
      scope: "graphein",
      resource: "https://graphein.example.com/mcp",
    });

    // First consume succeeds
    const first = await oauth.consumeRefreshToken(
      rawToken,
      "test-client",
      "https://graphein.example.com/mcp",
    );
    expect(first).not.toBeNull();

    // Second consume fails because the token is now revoked
    const second = await oauth.consumeRefreshToken(
      rawToken,
      "test-client",
      "https://graphein.example.com/mcp",
    );
    expect(second).toBeNull();
  });

  test("rejects token with wrong client ID", async () => {
    const user = await createTestUser(db);

    const rawToken = await oauth.createRefreshToken({
      clientId: "client-a",
      userId: user.id,
      scope: "graphein",
      resource: "https://graphein.example.com/mcp",
    });

    const result = await oauth.consumeRefreshToken(
      rawToken,
      "client-b",
      "https://graphein.example.com/mcp",
    );
    expect(result).toBeNull();
  });

  test("rejects token with wrong resource", async () => {
    const user = await createTestUser(db);

    const rawToken = await oauth.createRefreshToken({
      clientId: "test-client",
      userId: user.id,
      scope: "graphein",
      resource: "https://graphein.example.com/mcp",
    });

    const result = await oauth.consumeRefreshToken(
      rawToken,
      "test-client",
      "https://other.example.com/mcp",
    );
    expect(result).toBeNull();
  });

  test("rejects expired token", async () => {
    const user = await createTestUser(db);

    const rawToken = await oauth.createRefreshToken({
      clientId: "test-client",
      userId: user.id,
      scope: "graphein",
      resource: "https://graphein.example.com/mcp",
    });

    // Manually expire the token
    const allTokens = await db.select().from(oauthRefreshTokens);
    await db
      .update(oauthRefreshTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(oauthRefreshTokens.tokenHash, allTokens[0].tokenHash));

    const result = await oauth.consumeRefreshToken(
      rawToken,
      "test-client",
      "https://graphein.example.com/mcp",
    );
    expect(result).toBeNull();
  });

  test("revokeRefreshToken marks token as revoked", async () => {
    const user = await createTestUser(db);

    const rawToken = await oauth.createRefreshToken({
      clientId: "test-client",
      userId: user.id,
      scope: "graphein",
      resource: "https://graphein.example.com/mcp",
    });

    await oauth.revokeRefreshToken(rawToken);

    // Token should no longer be consumable
    const result = await oauth.consumeRefreshToken(
      rawToken,
      "test-client",
      "https://graphein.example.com/mcp",
    );
    expect(result).toBeNull();
  });
});

describe("cleanupExpired", () => {
  test("removes expired authorization codes", async () => {
    const user = await createTestUser(db);

    // Create a code then expire it
    const code = await oauth.createAuthorizationCode({
      clientId: "test-client",
      userId: user.id,
      redirectUri: "https://example.com/cb",
      scope: "graphein",
      resource: "https://graphein.example.com/mcp",
      codeChallenge: "challenge",
    });

    await db
      .update(oauthAuthorizationCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(oauthAuthorizationCodes.code, code));

    await oauth.cleanupExpired();

    const remaining = await db.select().from(oauthAuthorizationCodes);
    expect(remaining).toHaveLength(0);
  });

  test("removes expired refresh tokens", async () => {
    const user = await createTestUser(db);

    await oauth.createRefreshToken({
      clientId: "test-client",
      userId: user.id,
      scope: "graphein",
      resource: "https://graphein.example.com/mcp",
    });

    // Expire it
    const allTokens = await db.select().from(oauthRefreshTokens);
    await db
      .update(oauthRefreshTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(oauthRefreshTokens.tokenHash, allTokens[0].tokenHash));

    await oauth.cleanupExpired();

    const remaining = await db.select().from(oauthRefreshTokens);
    expect(remaining).toHaveLength(0);
  });

  test("removes revoked refresh tokens", async () => {
    const user = await createTestUser(db);

    const rawToken = await oauth.createRefreshToken({
      clientId: "test-client",
      userId: user.id,
      scope: "graphein",
      resource: "https://graphein.example.com/mcp",
    });

    // Revoke it (sets revokedAt to now)
    await oauth.revokeRefreshToken(rawToken);

    await oauth.cleanupExpired();

    const remaining = await db.select().from(oauthRefreshTokens);
    expect(remaining).toHaveLength(0);
  });

  test("does not remove active tokens", async () => {
    const user = await createTestUser(db);

    // Create an active (non-expired, non-revoked) refresh token
    await oauth.createRefreshToken({
      clientId: "test-client",
      userId: user.id,
      scope: "graphein",
      resource: "https://graphein.example.com/mcp",
    });

    // Create an active authorization code
    await oauth.createAuthorizationCode({
      clientId: "test-client",
      userId: user.id,
      redirectUri: "https://example.com/cb",
      scope: "graphein",
      resource: "https://graphein.example.com/mcp",
      codeChallenge: "challenge",
    });

    await oauth.cleanupExpired();

    const remainingCodes = await db.select().from(oauthAuthorizationCodes);
    expect(remainingCodes).toHaveLength(1);

    const remainingTokens = await db.select().from(oauthRefreshTokens);
    expect(remainingTokens).toHaveLength(1);
  });

  test("cleans up selectively: removes expired, keeps active", async () => {
    const user = await createTestUser(db);

    // Active refresh token
    await oauth.createRefreshToken({
      clientId: "test-client",
      userId: user.id,
      scope: "graphein",
      resource: "https://graphein.example.com/mcp",
    });

    // Expired refresh token
    const expiredToken = await oauth.createRefreshToken({
      clientId: "test-client",
      userId: user.id,
      scope: "graphein",
      resource: "https://other.example.com/mcp",
    });
    // Compute the hash to target the right row
    const expiredHashBuf = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(expiredToken),
    );
    const expiredHash = Buffer.from(expiredHashBuf).toString("hex");
    await db
      .update(oauthRefreshTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(oauthRefreshTokens.tokenHash, expiredHash));

    // Active auth code
    await oauth.createAuthorizationCode({
      clientId: "test-client",
      userId: user.id,
      redirectUri: "https://example.com/cb",
      scope: "graphein",
      resource: "https://graphein.example.com/mcp",
      codeChallenge: "active-challenge",
    });

    // Expired auth code
    const expiredCode = await oauth.createAuthorizationCode({
      clientId: "test-client",
      userId: user.id,
      redirectUri: "https://example.com/cb",
      scope: "graphein",
      resource: "https://graphein.example.com/mcp",
      codeChallenge: "expired-challenge",
    });
    await db
      .update(oauthAuthorizationCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(oauthAuthorizationCodes.code, expiredCode));

    await oauth.cleanupExpired();

    const remainingCodes = await db.select().from(oauthAuthorizationCodes);
    expect(remainingCodes).toHaveLength(1);
    expect(remainingCodes[0].codeChallenge).toBe("active-challenge");

    const remainingTokens = await db.select().from(oauthRefreshTokens);
    expect(remainingTokens).toHaveLength(1);
    expect(remainingTokens[0].resource).toBe("https://graphein.example.com/mcp");
  });
});
