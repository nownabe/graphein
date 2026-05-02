import { eq, and, lt, gt, isNotNull, isNull, or } from "drizzle-orm";
import type { Database } from "../db/client";
import { oauthClients, oauthAuthorizationCodes, oauthRefreshTokens } from "../db/schema";

const CODE_EXPIRY_MINUTES = 5;
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

function generateRandomString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Buffer.from(bytes).toString("base64url");
}

async function hashSha256(data: string): Promise<Buffer> {
  const encoded = new TextEncoder().encode(data);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Buffer.from(digest);
}

async function hashToHex(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Buffer.from(digest).toString("hex");
}

export function createOAuthService(db: Database) {
  async function registerClient(metadata: {
    clientName: string;
    redirectUris: string[];
    grantTypes?: string[];
    tokenEndpointAuthMethod?: string;
  }) {
    const clientId = generateRandomString(32);
    const isPublic = metadata.tokenEndpointAuthMethod === "none";

    const rawSecret = isPublic ? null : generateRandomString(48);
    const secretHash = rawSecret ? await hashSha256(rawSecret) : null;

    const [client] = await db
      .insert(oauthClients)
      .values({
        clientId,
        clientSecretHash: secretHash,
        clientName: metadata.clientName,
        redirectUris: metadata.redirectUris,
        grantTypes: metadata.grantTypes ?? ["authorization_code"],
      })
      .returning();

    return { ...client, clientSecret: rawSecret };
  }

  async function getClient(clientId: string) {
    return db.query.oauthClients.findFirst({
      where: eq(oauthClients.clientId, clientId),
    });
  }

  async function createAuthorizationCode(params: {
    clientId: string;
    userId: string;
    redirectUri: string;
    scope: string;
    resource: string;
    codeChallenge: string;
    codeChallengeMethod?: string;
  }) {
    const code = generateRandomString(32);
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

    await db.insert(oauthAuthorizationCodes).values({
      code,
      clientId: params.clientId,
      userId: params.userId,
      redirectUri: params.redirectUri,
      scope: params.scope,
      resource: params.resource,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod ?? "S256",
      expiresAt,
    });

    return code;
  }

  async function consumeAuthorizationCode(code: string) {
    // Atomic delete-and-return to prevent double-consume race conditions
    const [record] = await db
      .delete(oauthAuthorizationCodes)
      .where(
        and(
          eq(oauthAuthorizationCodes.code, code),
          gt(oauthAuthorizationCodes.expiresAt, new Date()),
        ),
      )
      .returning();

    if (!record) return null;

    return {
      clientId: record.clientId,
      userId: record.userId,
      redirectUri: record.redirectUri,
      scope: record.scope,
      resource: record.resource,
      codeChallenge: record.codeChallenge,
      codeChallengeMethod: record.codeChallengeMethod,
    };
  }

  async function getCodeChallenge(code: string) {
    const record = await db.query.oauthAuthorizationCodes.findFirst({
      where: eq(oauthAuthorizationCodes.code, code),
      columns: { codeChallenge: true, codeChallengeMethod: true },
    });

    if (!record) return null;
    return {
      codeChallenge: record.codeChallenge,
      codeChallengeMethod: record.codeChallengeMethod,
    };
  }

  async function createRefreshToken(params: {
    clientId: string;
    userId: string;
    scope: string;
    resource: string;
  }) {
    const rawToken = generateRandomString(48);
    const tokenHash = await hashToHex(rawToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await db.insert(oauthRefreshTokens).values({
      tokenHash,
      clientId: params.clientId,
      userId: params.userId,
      scope: params.scope,
      resource: params.resource,
      expiresAt,
    });

    return rawToken;
  }

  async function consumeRefreshToken(token: string, clientId: string, resource?: string) {
    const tokenHash = await hashToHex(token);

    // Atomic revoke-and-return to prevent double-consume race conditions.
    // When resource is omitted, match by token hash + client ID only;
    // when provided, also require exact resource equality.
    const conditions = [
      eq(oauthRefreshTokens.tokenHash, tokenHash),
      eq(oauthRefreshTokens.clientId, clientId),
      isNull(oauthRefreshTokens.revokedAt),
      gt(oauthRefreshTokens.expiresAt, new Date()),
    ];
    if (resource !== undefined) {
      conditions.push(eq(oauthRefreshTokens.resource, resource));
    }

    const [record] = await db
      .update(oauthRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(...conditions))
      .returning();

    if (!record) return null;

    return {
      clientId: record.clientId,
      userId: record.userId,
      scope: record.scope,
      resource: record.resource,
    };
  }

  async function revokeRefreshToken(token: string) {
    const tokenHash = await hashToHex(token);
    await db
      .update(oauthRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(oauthRefreshTokens.tokenHash, tokenHash));
  }

  async function cleanupExpired() {
    const now = new Date();
    await Promise.all([
      db.delete(oauthAuthorizationCodes).where(lt(oauthAuthorizationCodes.expiresAt, now)),
      db
        .delete(oauthRefreshTokens)
        .where(
          or(
            and(isNotNull(oauthRefreshTokens.revokedAt), lt(oauthRefreshTokens.revokedAt, now)),
            lt(oauthRefreshTokens.expiresAt, now),
          ),
        ),
    ]);
  }

  return {
    registerClient,
    getClient,
    createAuthorizationCode,
    consumeAuthorizationCode,
    getCodeChallenge,
    createRefreshToken,
    consumeRefreshToken,
    revokeRefreshToken,
    cleanupExpired,
  };
}

export type OAuthService = ReturnType<typeof createOAuthService>;
