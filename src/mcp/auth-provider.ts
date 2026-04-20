import type { Context } from "hono";
import { sign, verify } from "hono/jwt";
import type { AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { OAuthService } from "../oauth/service";
import type { UserService } from "../users/service";
import type { SessionHelpers } from "../auth/session";

// @hono/mcp passes Hono Context instead of express Response to authorize(),
// but the SDK type declares express.Response. We define our own interface to
// match what @hono/mcp actually provides at runtime.
interface HonoOAuthServerProvider {
  readonly clientsStore: OAuthRegisteredClientsStore;
  authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    c: Context,
  ): Promise<void>;
  challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string>;
  exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    codeVerifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens>;
  exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens>;
  verifyAccessToken(token: string): Promise<AuthInfo>;
  revokeToken?(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void>;
}

const ACCESS_TOKEN_EXPIRY_SECONDS = 60 * 60; // 1 hour

interface McpJwtPayload {
  sub: string;
  aud: string;
  scope: string;
  typ: string;
  exp: number;
  iat: number;
}

export class GrapheinOAuthProvider implements HonoOAuthServerProvider {
  constructor(
    private oauthService: OAuthService,
    private userService: UserService,
    private session: SessionHelpers,
    private baseUrl: string,
    private mcpJwtSecret: string,
  ) {}

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: async (clientId: string) => {
        const client = await this.oauthService.getClient(clientId);
        if (!client) return undefined;
        return {
          client_id: client.clientId,
          client_name: client.clientName,
          redirect_uris: client.redirectUris,
          grant_types: client.grantTypes,
          token_endpoint_auth_method: client.clientSecretHash ? "client_secret_post" : "none",
        } as OAuthClientInformationFull;
      },
      registerClient: async (clientInfo) => {
        const result = await this.oauthService.registerClient({
          clientName: clientInfo.client_name ?? "Unknown",
          redirectUris: (clientInfo.redirect_uris ?? []).map((u) => u.toString()),
          grantTypes: clientInfo.grant_types,
          tokenEndpointAuthMethod: clientInfo.token_endpoint_auth_method,
        });
        return {
          ...clientInfo,
          client_id: result.clientId,
          client_secret: result.clientSecret ?? undefined,
          client_id_issued_at: Math.floor(Date.now() / 1000),
        } as OAuthClientInformationFull;
      },
    };
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    c: Context,
  ): Promise<void> {
    // Check Slack OIDC session via JWT cookie
    const token = getCookie(c, "token");
    const payload = token ? await this.session.verifyToken(token) : null;

    if (!payload) {
      // Redirect to Slack login, preserving the full authorization URL as return target
      const authUrl = new URL(`${this.baseUrl}/oauth/authorize`);
      authUrl.searchParams.set("client_id", client.client_id);
      authUrl.searchParams.set("redirect_uri", params.redirectUri);
      authUrl.searchParams.set("code_challenge", params.codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");
      authUrl.searchParams.set("response_type", "code");
      if (params.state) authUrl.searchParams.set("state", params.state);
      if (params.scopes?.length) authUrl.searchParams.set("scope", params.scopes.join(" "));
      if (params.resource) authUrl.searchParams.set("resource", params.resource.toString());

      const loginUrl = new URL(`${this.baseUrl}/auth/slack`);
      loginUrl.searchParams.set("return_to", authUrl.toString());

      c.res = new Response(null, {
        status: 302,
        headers: { Location: loginUrl.toString() },
      });
      return;
    }

    // Check if the user explicitly approved via the consent form.
    // The consent page redirects back to /oauth/authorize with consent=approved
    // appended to the query string.
    const consent = c.req.query("consent");

    if (consent === "denied") {
      const redirectUrl = new URL(params.redirectUri);
      redirectUrl.searchParams.set("error", "access_denied");
      if (params.state) redirectUrl.searchParams.set("state", params.state);
      c.res = new Response(null, {
        status: 302,
        headers: { Location: redirectUrl.toString() },
      });
      return;
    }

    if (consent === "approved") {
      // User approved — generate authorization code and redirect
      const scope = params.scopes?.join(" ") || "graphein";
      const resource = params.resource?.toString() || `${this.baseUrl}/mcp`;

      const code = await this.oauthService.createAuthorizationCode({
        clientId: client.client_id,
        userId: payload.sub,
        redirectUri: params.redirectUri,
        scope,
        resource,
        codeChallenge: params.codeChallenge,
      });

      const redirectUrl = new URL(params.redirectUri);
      redirectUrl.searchParams.set("code", code);
      if (params.state) redirectUrl.searchParams.set("state", params.state);

      c.res = new Response(null, {
        status: 302,
        headers: { Location: redirectUrl.toString() },
      });
      return;
    }

    // No consent decision yet — show consent page
    const scope = params.scopes?.join(" ") || "graphein";
    const consentHtml = renderConsentPage({
      clientName: client.client_name ?? client.client_id,
      scope,
      baseUrl: this.baseUrl,
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      state: params.state,
      resource: params.resource?.toString(),
    });

    c.res = new Response(consentHtml, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const result = await this.oauthService.getCodeChallenge(authorizationCode);
    if (!result) throw new Error("Authorization code not found");
    return result.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const codeData = await this.oauthService.consumeAuthorizationCode(authorizationCode);
    if (!codeData) throw new Error("Invalid or expired authorization code");

    if (codeData.clientId !== client.client_id) {
      throw new Error("Client ID mismatch");
    }

    if (resource && codeData.resource !== resource.toString()) {
      throw new Error("Resource mismatch");
    }

    const accessToken = await this.createAccessToken(
      codeData.userId,
      codeData.scope,
      codeData.resource,
    );

    const refreshToken = await this.oauthService.createRefreshToken({
      clientId: codeData.clientId,
      userId: codeData.userId,
      scope: codeData.scope,
      resource: codeData.resource,
    });

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_EXPIRY_SECONDS,
      refresh_token: refreshToken,
      scope: codeData.scope,
    };
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    _scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    const tokenData = await this.oauthService.consumeRefreshToken(
      refreshToken,
      client.client_id,
      resource?.toString() ?? "",
    );
    if (!tokenData) throw new Error("Invalid or expired refresh token");

    const accessToken = await this.createAccessToken(
      tokenData.userId,
      tokenData.scope,
      tokenData.resource,
    );

    const newRefreshToken = await this.oauthService.createRefreshToken({
      clientId: tokenData.clientId,
      userId: tokenData.userId,
      scope: tokenData.scope,
      resource: tokenData.resource,
    });

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_EXPIRY_SECONDS,
      refresh_token: newRefreshToken,
      scope: tokenData.scope,
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    let payload: McpJwtPayload;
    try {
      payload = (await verify(token, this.mcpJwtSecret, "HS256")) as unknown as McpJwtPayload;
    } catch {
      throw new Error("Invalid access token");
    }

    if (payload.typ !== "mcp+jwt") {
      throw new Error("Invalid token type");
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) {
      throw new Error("Token expired");
    }

    const user = await this.userService.findUserById(payload.sub);
    if (!user) {
      throw new Error("User not found");
    }
    if (user.deactivatedAt != null) {
      throw new Error("User is deactivated");
    }

    return {
      token,
      clientId: "unknown",
      scopes: payload.scope ? payload.scope.split(" ") : [],
      expiresAt: payload.exp,
      resource: new URL(payload.aud),
      extra: { sub: payload.sub },
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    await this.oauthService.revokeRefreshToken(request.token);
  }

  private async createAccessToken(
    userId: string,
    scope: string,
    resource: string,
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return sign(
      {
        sub: userId,
        aud: resource,
        scope,
        typ: "mcp+jwt",
        exp: now + ACCESS_TOKEN_EXPIRY_SECONDS,
        iat: now,
      },
      this.mcpJwtSecret,
      "HS256",
    );
  }
}

function getCookie(c: Context, name: string): string | undefined {
  const header = c.req.header("Cookie");
  if (!header) return undefined;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderConsentPage(opts: {
  clientName: string;
  scope: string;
  baseUrl: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  resource?: string;
}): string {
  const name = escapeHtml(opts.clientName);
  const scope = escapeHtml(opts.scope);

  // Build approve/deny URLs that redirect back to /oauth/authorize with consent param
  function buildConsentUrl(decision: "approved" | "denied"): string {
    const url = new URL(`${opts.baseUrl}/oauth/authorize`);
    url.searchParams.set("client_id", opts.clientId);
    url.searchParams.set("redirect_uri", opts.redirectUri);
    url.searchParams.set("code_challenge", opts.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("consent", decision);
    if (opts.state) url.searchParams.set("state", opts.state);
    if (opts.scope) url.searchParams.set("scope", opts.scope);
    if (opts.resource) url.searchParams.set("resource", opts.resource);
    return escapeHtml(url.toString());
  }

  const approveUrl = buildConsentUrl("approved");
  const denyUrl = buildConsentUrl("denied");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authorize ${name} — Graphein</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0f0f14;
      color: #e0e0e6;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
    }
    .card {
      background: #1a1a24;
      border: 1px solid #2a2a3a;
      border-radius: 16px;
      padding: 2rem;
      max-width: 420px;
      width: 100%;
    }
    h1 { font-size: 1.25rem; margin: 0 0 1rem; }
    .client-name { color: #7c8aff; font-weight: 600; }
    .scope-label { color: #9ca3af; font-size: 0.875rem; margin-top: 1rem; }
    .scope-value {
      font-family: monospace;
      background: #12121a;
      padding: 0.5rem;
      border-radius: 8px;
      margin-top: 0.25rem;
    }
    .actions { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
    .actions a {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0.625rem 1rem;
      border: none;
      border-radius: 8px;
      font-size: 0.9375rem;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
    }
    .approve { background: #7c8aff; color: #fff; }
    .approve:hover { background: #6b79ee; }
    .deny { background: #2a2a3a; color: #e0e0e6; }
    .deny:hover { background: #3a3a4a; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Authorize <span class="client-name">${name}</span></h1>
    <p>This application is requesting access to your Graphein account.</p>
    <div class="scope-label">Requested permissions</div>
    <div class="scope-value">${scope}</div>
    <div class="actions">
      <a href="${approveUrl}" class="approve">Approve</a>
      <a href="${denyUrl}" class="deny">Deny</a>
    </div>
  </div>
</body>
</html>`;
}
