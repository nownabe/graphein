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
import { OAuthConsentPage } from "../views/pages/oauth-consent";

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
const CONSENT_REQUEST_EXPIRY_SECONDS = 10 * 60; // 10 minutes

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
    private devMode: boolean = false,
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
          scope: "graphein",
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

    // Show consent page. Authorization params are stored in a signed JWT
    // ("request token") so the consent form cannot be tampered with.
    const scope = params.scopes?.join(" ") || "graphein";
    const now = Math.floor(Date.now() / 1000);
    const requestToken = await sign(
      {
        typ: "consent_req",
        client_id: client.client_id,
        redirect_uri: params.redirectUri,
        code_challenge: params.codeChallenge,
        state: params.state ?? "",
        scope,
        resource: params.resource?.toString() ?? "",
        exp: now + CONSENT_REQUEST_EXPIRY_SECONDS,
        iat: now,
      },
      this.mcpJwtSecret,
      "HS256",
    );

    const locale = getCookie(c, "locale") === "ja" ? "ja" : "en";
    const theme = getCookie(c, "theme") === "light" ? "light" : "dark";
    const redirectUri = params.redirectUri;

    const html = c.html(
      <OAuthConsentPage
        clientName={client.client_name ?? client.client_id}
        redirectUri={redirectUri}
        scope={scope}
        requestToken={requestToken}
        locale={locale}
        theme={theme}
        devMode={this.devMode}
      />,
    );
    c.res = html instanceof Promise ? await html : html;
  }

  /**
   * Handles the consent form POST from /oauth/consent.
   * This is mounted as a separate route so the existing CSRF middleware
   * protects it via Origin/Referer validation.
   */
  async handleConsent(c: Context): Promise<Response> {
    const token = getCookie(c, "token");
    const payload = token ? await this.session.verifyToken(token) : null;
    if (!payload) {
      return c.text("Unauthorized", 401);
    }

    const body = await c.req.parseBody();
    const decision = body.decision as string;
    const requestToken = body.request_token as string;

    if (!requestToken) {
      return c.text("Bad Request", 400);
    }

    // Verify the signed request token to recover the original authorization params
    let reqPayload: Record<string, unknown>;
    try {
      reqPayload = (await verify(requestToken, this.mcpJwtSecret, "HS256")) as Record<
        string,
        unknown
      >;
    } catch {
      return c.text("Invalid or expired consent request", 400);
    }

    if (reqPayload.typ !== "consent_req") {
      return c.text("Invalid consent request", 400);
    }

    const redirectUri = reqPayload.redirect_uri as string;
    const state = reqPayload.state as string;

    if (decision === "deny") {
      const redirectUrl = new URL(redirectUri);
      redirectUrl.searchParams.set("error", "access_denied");
      if (state) redirectUrl.searchParams.set("state", state);
      return c.redirect(redirectUrl.toString(), 302);
    }

    if (decision !== "approve") {
      return c.text("Bad Request", 400);
    }

    const clientId = reqPayload.client_id as string;
    const codeChallenge = reqPayload.code_challenge as string;
    const scope = (reqPayload.scope as string) || "graphein";
    const resource = (reqPayload.resource as string) || `${this.baseUrl}/mcp`;

    const code = await this.oauthService.createAuthorizationCode({
      clientId,
      userId: payload.sub,
      redirectUri,
      scope,
      resource,
      codeChallenge,
    });

    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.set("code", code);
    if (state) redirectUrl.searchParams.set("state", state);
    return c.redirect(redirectUrl.toString(), 302);
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
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const codeData = await this.oauthService.consumeAuthorizationCode(authorizationCode);
    if (!codeData) throw new Error("Invalid or expired authorization code");

    if (codeData.clientId !== client.client_id) {
      throw new Error("Client ID mismatch");
    }

    if (redirectUri && codeData.redirectUri !== redirectUri) {
      throw new Error("Redirect URI mismatch");
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
        jti: crypto.randomUUID(),
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
