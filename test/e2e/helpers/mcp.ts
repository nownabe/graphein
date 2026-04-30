import { sign } from "hono/jwt";
import { env } from "./env";
import { findUserBySlackId } from "./db";

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

function generateRandomString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Buffer.from(bytes).toString("base64url");
}

async function sha256Base64url(plain: string): Promise<string> {
  const encoded = new TextEncoder().encode(plain);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Buffer.from(digest).toString("base64url");
}

// ---------------------------------------------------------------------------
// OAuth helpers
// ---------------------------------------------------------------------------

interface OAuthClient {
  clientId: string;
  clientSecret?: string;
}

interface OAuthTokens {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

/** Register a dynamic OAuth client (public, no secret). */
export async function registerOAuthClient(name = "E2E Test Client"): Promise<OAuthClient> {
  const res = await fetch(`${env.grapheinUrl}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: name,
      redirect_uris: ["http://localhost:19999/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      token_endpoint_auth_method: "none",
    }),
  });
  if (!res.ok) {
    throw new Error(`Client registration failed: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  return { clientId: body.client_id, clientSecret: body.client_secret };
}

/**
 * Create a session cookie value (JWT) for the given Slack user ID.
 * Reuses the same signing secret as the E2E server.
 */
async function createSessionToken(userId: string, displayName: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: userId, name: displayName, exp: now + 3600 }, env.jwtSecret);
}

/**
 * Perform the full OAuth authorization code flow with PKCE and return tokens.
 *
 * Steps:
 * 1. Generate PKCE code_verifier / code_challenge
 * 2. GET /oauth/authorize with session cookie → parse request_token from consent HTML
 * 3. POST /oauth/consent with decision=approve → follow redirect to get authorization code
 * 4. POST /oauth/token with code + code_verifier → return tokens
 */
export async function performOAuthFlow(clientId: string): Promise<OAuthTokens> {
  const user = await findUserBySlackId(env.slackUserId);
  if (!user) throw new Error("E2E test user not found in DB");

  const sessionToken = await createSessionToken(user.id as string, user.display_name as string);
  const redirectUri = "http://localhost:19999/callback";

  // PKCE
  const codeVerifier = generateRandomString(32);
  const codeChallenge = await sha256Base64url(codeVerifier);

  const state = generateRandomString(16);

  // Step 1: GET /oauth/authorize → consent page HTML
  const authorizeUrl = new URL(`${env.grapheinUrl}/oauth/authorize`);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("scope", "graphein");

  const consentRes = await fetch(authorizeUrl.toString(), {
    headers: { Cookie: `token=${sessionToken}; locale=en` },
    redirect: "manual",
  });

  if (consentRes.status !== 200) {
    throw new Error(`Expected consent page (200), got ${consentRes.status}`);
  }

  const html = await consentRes.text();

  // Extract request_token from the hidden input
  const tokenMatch = html.match(/name="request_token"\s+value="([^"]+)"/);
  if (!tokenMatch) {
    throw new Error("Could not find request_token in consent page HTML");
  }
  const requestToken = tokenMatch[1];

  // Step 2: POST /oauth/consent with approve → redirect with code
  const consentBody = new URLSearchParams({
    decision: "approve",
    request_token: requestToken,
  });

  const approveRes = await fetch(`${env.grapheinUrl}/oauth/consent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: `token=${sessionToken}; locale=en`,
      Origin: env.grapheinUrl,
    },
    body: consentBody.toString(),
    redirect: "manual",
  });

  if (approveRes.status !== 302) {
    throw new Error(`Expected redirect (302) from consent, got ${approveRes.status}`);
  }

  const location = approveRes.headers.get("Location");
  if (!location) throw new Error("No Location header in consent redirect");

  const callbackUrl = new URL(location);
  const code = callbackUrl.searchParams.get("code");
  const returnedState = callbackUrl.searchParams.get("state");

  if (!code) throw new Error("No authorization code in redirect");
  if (returnedState !== state) throw new Error("State mismatch in redirect");

  // Step 3: POST /oauth/token → exchange code for tokens
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  });

  const tokenRes = await fetch(`${env.grapheinUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody.toString(),
  });

  if (!tokenRes.ok) {
    throw new Error(`Token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
  }

  return tokenRes.json();
}

/**
 * Refresh an access token using a refresh token.
 */
export async function refreshAccessToken(
  clientId: string,
  refreshToken: string,
): Promise<OAuthTokens> {
  const tokenBody = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    resource: `${env.grapheinUrl}/mcp`,
  });

  const res = await fetch(`${env.grapheinUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody.toString(),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

/**
 * Revoke a token (refresh token).
 */
export async function revokeToken(clientId: string, token: string): Promise<Response> {
  const body = new URLSearchParams({
    token,
    client_id: clientId,
  });

  return fetch(`${env.grapheinUrl}/oauth/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

// ---------------------------------------------------------------------------
// MCP JSON-RPC helpers
// ---------------------------------------------------------------------------

let _jsonRpcId = 0;

/** Send a JSON-RPC request to the MCP endpoint. */
export async function mcpRequest(
  accessToken: string,
  method: string,
  params?: Record<string, unknown>,
): Promise<Response> {
  _jsonRpcId += 1;
  return fetch(`${env.grapheinUrl}/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: _jsonRpcId,
      method,
      ...(params !== undefined ? { params } : {}),
    }),
  });
}

/**
 * Parse a JSON-RPC response that may be returned as `application/json`
 * or as `text/event-stream` (SSE). StreamableHTTPTransport defaults to
 * SSE, so we extract the last `data:` line from a `message` event.
 */
export async function parseJsonRpcResponse(
  res: Response,
): Promise<{ id: number; jsonrpc: string; result?: unknown; error?: unknown }> {
  const contentType = res.headers.get("Content-Type") ?? "";

  if (contentType.includes("text/event-stream")) {
    const text = await res.text();
    // SSE format: "event: message\ndata: {json}\n\n"
    // There may be multiple events; we want the last `data:` payload
    // that belongs to a `message` event.
    const lines = text.split("\n");
    let lastData: string | null = null;
    for (const line of lines) {
      if (line.startsWith("data:")) {
        lastData = line.slice("data:".length).trim();
      }
    }
    if (!lastData) {
      throw new Error(`No data payload found in SSE response: ${text}`);
    }
    return JSON.parse(lastData);
  }

  return res.json();
}

/** Call an MCP tool and return the parsed JSON-RPC result. */
export async function mcpToolCall(
  accessToken: string,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<{ id: number; jsonrpc: string; result?: unknown; error?: unknown }> {
  const res = await mcpRequest(accessToken, "tools/call", {
    name: toolName,
    arguments: args,
  });
  if (!res.ok) {
    throw new Error(`MCP request failed: ${res.status} ${await res.text()}`);
  }
  return parseJsonRpcResponse(res);
}

/** Read an MCP resource and return the parsed JSON-RPC result. */
export async function mcpResourceRead(
  accessToken: string,
  uri: string,
): Promise<{ id: number; jsonrpc: string; result?: unknown; error?: unknown }> {
  const res = await mcpRequest(accessToken, "resources/read", { uri });
  if (!res.ok) {
    throw new Error(`MCP resource read failed: ${res.status} ${await res.text()}`);
  }
  return parseJsonRpcResponse(res);
}

/** Create an MCP access token directly by signing a JWT (bypasses OAuth flow). */
export async function createMcpAccessToken(userId: string, scope = "graphein"): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: userId,
      aud: `${env.grapheinUrl}/mcp`,
      scope,
      typ: "mcp+jwt",
      exp: now + 3600,
      iat: now,
    },
    env.mcpJwtSecret,
    "HS256",
  );
}

// ---------------------------------------------------------------------------
// DB cleanup helpers
// ---------------------------------------------------------------------------

export { query } from "./db";
