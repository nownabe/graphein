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

    // User is logged in — generate authorization code and redirect
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

    const deactivated = await this.userService.isDeactivated(payload.sub);
    if (deactivated) {
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
