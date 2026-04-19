# Graphein MCP Server

## Overview

Add an MCP (Model Context Protocol) server to Graphein, allowing AI assistants (Claude, etc.) to interact with tasks, snippets, and kudos through a standardized protocol. The MCP server exposes the same capabilities as the JSON API but through MCP tools and resources, enabling AI-powered workflows such as task triage, status summaries, and automated archiving.

## Goals

- Expose Graphein's API capabilities via MCP tools and resources
- Authenticate via OAuth 2.1 in compliance with the MCP authorization spec
- Integrate into the existing Hono app with minimal structural changes
- Support the Streamable HTTP transport for remote access

## Non-Goals

- stdio transport (Graphein is a remote server, not a local CLI tool)
- MCP prompts (no predefined prompt templates in this iteration)
- New data operations beyond what the API design already defines

---

## Technology Selection

### Transport: Streamable HTTP

The MCP spec defines three transports: stdio, SSE (legacy/deprecated), and Streamable HTTP. Streamable HTTP is the recommended transport for remote servers as of the 2025-03-26 spec revision. It uses HTTP POST for client-to-server messages and SSE for server-to-client streaming, with optional session management.

Graphein runs as a remote web server, so Streamable HTTP is the natural choice.

### Libraries

| Package                     | Purpose                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `@hono/mcp`                 | Hono adapter for MCP Streamable HTTP transport + OAuth AS endpoints                       |
| `@modelcontextprotocol/sdk` | Official MCP TypeScript SDK for defining tools/resources                                  |
| `hono-rate-limiter`         | Peer dependency of `@hono/mcp` (used by `mcpAuthRouter` for OAuth endpoint rate limiting) |

`@hono/mcp` provides:

- **`StreamableHTTPTransport`** — handles HTTP routing (POST/GET/DELETE) for the Streamable HTTP protocol, accepts a Hono `Context` directly
- **`mcpAuthRouter`** — sets up OAuth 2.1 Authorization Server endpoints (`/authorize`, `/token`, `/register`, `/revoke`) and well-known metadata discovery routes
- **`wellKnownRouter`** — serves Protected Resource Metadata (RFC 9728) and Authorization Server Metadata (RFC 8414)

**Why @hono/mcp?**

- Graphein already uses Hono — native integration, no adapter layer
- `mcpAuthRouter` handles the OAuth 2.1 endpoint boilerplate (PKCE validation, rate limiting, metadata discovery)
- Actively maintained in the official `honojs/middleware` monorepo

---

## Authentication

### Overview

The MCP authorization spec requires HTTP-based MCP servers to implement OAuth 2.1 for authentication. Graphein acts as both the **OAuth 2.1 Authorization Server** (issuing tokens to MCP clients) and the **Resource Server** (validating tokens on MCP requests).

User authentication within the OAuth flow reuses the existing **Slack OIDC session** — users must be logged in to Graphein via Slack before they can authorize an MCP client.

### OAuth 2.1 Flow

```
MCP Client                    Graphein                         Slack
    │                            │                               │
    ├── POST /mcp (no token) ───►│                               │
    │◄── 401 + WWW-Authenticate ─┤                               │
    │                            │                               │
    ├── GET /.well-known/        │                               │
    │   oauth-protected-resource │                               │
    │   /mcp                ────►│                               │
    │◄── Resource metadata ──────┤                               │
    │    (authorization_servers) │                               │
    │                            │                               │
    ├── GET /.well-known/        │                               │
    │   oauth-authorization-     │                               │
    │   server              ────►│                               │
    │◄── AS metadata ────────────┤                               │
    │    (endpoints, PKCE, etc.) │                               │
    │                            │                               │
    ├── POST /oauth/register ───►│  (optional: dynamic client   │
    │◄── client_id, secret ──────┤   registration)              │
    │                            │                               │
    ├── GET /oauth/authorize ───►│                               │
    │    (code_challenge, scope) │                               │
    │                            ├── (no session?) ─────────────►│
    │                            │◄── Slack OIDC login ─────────┤
    │                            │                               │
    │                            ├── Show consent page           │
    │                            │   (user approves)             │
    │◄── redirect with code ─────┤                               │
    │                            │                               │
    ├── POST /oauth/token ──────►│                               │
    │    (code + code_verifier)  │                               │
    │◄── access_token (JWT) ─────┤                               │
    │                            │                               │
    ├── POST /mcp ──────────────►│                               │
    │    (Authorization: Bearer) │                               │
    │◄── MCP response ───────────┤                               │
```

### Discovery Endpoints (RFC 9728 / RFC 8414)

These are served by `@hono/mcp`'s `wellKnownRouter` (called internally by `mcpAuthRouter`).

#### `GET /.well-known/oauth-protected-resource/mcp`

Protected Resource Metadata (RFC 9728). Tells MCP clients where to find the Authorization Server.

```json
{
  "resource": "https://graphein.example.com/mcp",
  "authorization_servers": ["https://graphein.example.com"],
  "scopes_supported": ["graphein"],
  "resource_name": "Graphein MCP Server",
  "resource_documentation": "https://graphein.example.com/api/v1/reference"
}
```

#### `GET /.well-known/oauth-authorization-server`

Authorization Server Metadata (RFC 8414). Tells MCP clients what the AS supports.

```json
{
  "issuer": "https://graphein.example.com",
  "authorization_endpoint": "https://graphein.example.com/oauth/authorize",
  "token_endpoint": "https://graphein.example.com/oauth/token",
  "registration_endpoint": "https://graphein.example.com/oauth/register",
  "revocation_endpoint": "https://graphein.example.com/oauth/revoke",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "token_endpoint_auth_methods_supported": ["client_secret_post", "none"],
  "code_challenge_methods_supported": ["S256"],
  "scopes_supported": ["graphein"]
}
```

### CSRF Exemption

The existing CSRF middleware (Origin/Referer validation) exempts `/slack/*` and `/api/*` paths. Some MCP/OAuth paths must also be exempted because requests come from external MCP clients, not the browser:

- `/mcp` — MCP JSON-RPC requests from AI assistants
- `/oauth/token` — token exchange from MCP clients
- `/oauth/register` — dynamic client registration from MCP clients
- `/oauth/revoke` — token revocation from MCP clients
- `/.well-known/*` — metadata discovery (GET-only, safe methods already exempt)

**`/oauth/authorize` is NOT exempted.** The authorization endpoint serves a browser-facing consent form. The `GET` is a safe method (already exempt), and the `POST` (consent submission) is a browser form submission that must remain protected by the existing Origin/Referer check. This ensures the consent approval cannot be forged by a third-party site.

The CSRF middleware's exempt path list in `src/auth/csrf.ts` is extended to include the paths listed above.

### OAuth Endpoints

Served by `@hono/mcp`'s `mcpAuthRouter`. Graphein provides a custom `OAuthServerProvider` implementation that handles the business logic.

#### `GET /oauth/authorize`

Authorization endpoint. If the user has an active Slack OIDC session (JWT cookie), shows a consent page. If not, redirects to Slack login first, then returns to the authorization flow.

The consent page displays:

- The MCP client name (from client registration or Client ID Metadata Document)
- The requested scopes
- Approve / Deny buttons

On approval, generates an authorization code and redirects back to the client's `redirect_uri`. The `resource` parameter from the authorization request (RFC 8707) is persisted with the code so it can be bound to the issued token.

#### `POST /oauth/token`

Token endpoint. Exchanges an authorization code (with PKCE `code_verifier`) for tokens. The `resource` parameter must match the value stored with the authorization code; mismatches are rejected.

- **Access token**: JWT containing `sub` (user ID), `scope`, `aud` (bound to the `resource` parameter value), `exp` (1 hour)
- **Refresh token**: Opaque token stored in the database, valid for 30 days. Also bound to the resource.

#### `POST /oauth/register`

Dynamic Client Registration (RFC 7591). Stores client metadata in the database. Returns `client_id` and optionally `client_secret`.

#### `POST /oauth/revoke`

Token revocation. Invalidates a refresh token.

### Scopes

A single scope is defined for the initial implementation:

| Scope      | Description                                                           |
| ---------- | --------------------------------------------------------------------- |
| `graphein` | Full access to the authenticated user's data (tasks, snippets, kudos) |

Admin-level operations are governed by the user's role in Graphein, not by OAuth scopes. If the authenticated user has the `admin` role, admin tools are available regardless of scope. This mirrors the existing API key behavior where the key's role determines access.

Fine-grained scopes (e.g., `tasks:read`, `tasks:write`, `admin`) can be added in the future if needed.

### Access Token Format

Access tokens are JWTs signed with HS256 using a **dedicated signing key** (`MCP_JWT_SECRET`), separate from the session JWT secret. This prevents cross-boundary token confusion — a browser session token cannot be used as an MCP access token, and vice versa, even if the claims happen to overlap.

```json
{
  "sub": "user-uuid",
  "aud": "https://graphein.example.com/mcp",
  "scope": "graphein",
  "typ": "mcp+jwt",
  "exp": 1713500000,
  "iat": 1713496400
}
```

The `typ` claim provides an additional safeguard for token type disambiguation.

The MCP resource server middleware verifies:

1. JWT signature is valid (using `MCP_JWT_SECRET`)
2. `typ` claim equals `mcp+jwt`
3. `aud` matches the MCP server URL (from the `resource` parameter)
4. Token is not expired
5. User exists and is not deactivated

### Client Registration

MCP supports three client registration approaches (in priority order per the spec):

1. **Pre-registration** — hardcoded client credentials for known clients
2. **Client ID Metadata Documents** — HTTPS URLs as client IDs (self-hosted metadata)
3. **Dynamic Client Registration (RFC 7591)** — clients register on demand

Graphein supports **Dynamic Client Registration** via `POST /oauth/register` and **Client ID Metadata Documents** (handled by the authorization server validating the URL-formatted `client_id`). Pre-registration is not needed since Graphein is not a public service with known partner clients.

Both **confidential clients** (with `client_secret`, using `client_secret_post` at the token endpoint) and **public clients** (without a secret, using `token_endpoint_auth_method: "none"`) are supported. Most MCP clients (CLI tools, desktop apps) are public clients that rely on PKCE for security instead of a client secret.

### Rate Limiting

`mcpAuthRouter` applies its own rate limits to OAuth endpoints:

| Endpoint           | Limit                 |
| ------------------ | --------------------- |
| `/oauth/authorize` | 100 requests / 15 min |
| `/oauth/token`     | 50 requests / 15 min  |
| `/oauth/register`  | 20 requests / hour    |
| `/oauth/revoke`    | 50 requests / 15 min  |

The MCP endpoint (`/mcp`) uses Graphein's existing rate limiter. Since MCP tokens are per-user (not per-API-key), rate limiting is keyed by user ID with the same 60 requests per minute limit.

### Authorization

Tool-level authorization follows the same rules as the JSON API:

| User role | Scope                                                |
| --------- | ---------------------------------------------------- |
| `user`    | Own tasks (assigned/owned), all snippets, all kudos  |
| `admin`   | All tasks, all snippets, all kudos, admin operations |

---

## Database Schema

### `oauth_clients` Table

Stores dynamically registered OAuth clients.

```sql
CREATE TABLE oauth_clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     TEXT NOT NULL UNIQUE,
  client_secret TEXT,
  client_name   TEXT NOT NULL,
  redirect_uris TEXT[] NOT NULL,
  grant_types   TEXT[] NOT NULL DEFAULT '{authorization_code}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `oauth_authorization_codes` Table

Temporary storage for authorization codes. Codes expire after 5 minutes.

```sql
CREATE TABLE oauth_authorization_codes (
  code                   TEXT PRIMARY KEY,
  client_id              TEXT NOT NULL,
  user_id                UUID NOT NULL REFERENCES users(id),
  redirect_uri           TEXT NOT NULL,
  scope                  TEXT NOT NULL,
  resource               TEXT NOT NULL,
  code_challenge         TEXT NOT NULL,
  code_challenge_method  TEXT NOT NULL DEFAULT 'S256',
  expires_at             TIMESTAMPTZ NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `oauth_refresh_tokens` Table

Stores refresh tokens for token renewal.

```sql
CREATE TABLE oauth_refresh_tokens (
  token       TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL,
  user_id     UUID NOT NULL REFERENCES users(id),
  scope       TEXT NOT NULL,
  resource    TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Expired authorization codes and revoked refresh tokens are cleaned up periodically by a background task or lazily on access.

---

## MCP Tools

Tools map to the API endpoints defined in `docs/design/api.md`. Each tool accepts structured input and returns JSON content.

### Task Tools

#### `list_assigned_tasks`

List tasks assigned to the authenticated user.

| Parameter        | Type                       | Required | Description                          |
| ---------------- | -------------------------- | -------- | ------------------------------------ |
| `status`         | `"active"` \| `"archived"` | No       | Default: `"active"`                  |
| `done`           | `boolean`                  | No       | Filter by completion status          |
| `deadlineBefore` | ISO 8601 string            | No       | Tasks with deadline before this time |
| `deadlineAfter`  | ISO 8601 string            | No       | Tasks with deadline after this time  |
| `pageSize`       | integer                    | No       | Max results (default 50, max 100)    |
| `pageToken`      | string                     | No       | Cursor for next page                 |

Maps to: `GET /api/v1/tasks`

#### `list_owned_tasks`

List tasks owned by the authenticated user (or all tasks for admin).

| Parameter        | Type                       | Required | Description                          |
| ---------------- | -------------------------- | -------- | ------------------------------------ |
| `status`         | `"active"` \| `"archived"` | No       | Default: `"active"`                  |
| `deadlineBefore` | ISO 8601 string            | No       | Tasks with deadline before this time |
| `deadlineAfter`  | ISO 8601 string            | No       | Tasks with deadline after this time  |
| `pageSize`       | integer                    | No       | Max results (default 50, max 100)    |
| `pageToken`      | string                     | No       | Cursor for next page                 |

Maps to: `GET /api/v1/tasks/owned`

#### `list_task_assignees`

List assignees and their completion status for a specific owned task.

| Parameter   | Type        | Required | Description                       |
| ----------- | ----------- | -------- | --------------------------------- |
| `taskId`    | UUID string | Yes      | The task ID                       |
| `done`      | `boolean`   | No       | Filter by completion status       |
| `pageSize`  | integer     | No       | Max results (default 50, max 100) |
| `pageToken` | string      | No       | Cursor for next page              |

Maps to: `GET /api/v1/tasks/owned/:id/assignees`

#### `archive_task`

Archive a task. Idempotent.

| Parameter | Type        | Required | Description |
| --------- | ----------- | -------- | ----------- |
| `taskId`  | UUID string | Yes      | The task ID |

Maps to: `POST /api/v1/tasks/owned/:id/archive`

#### `unarchive_task`

Unarchive a task. Idempotent.

| Parameter | Type        | Required | Description |
| --------- | ----------- | -------- | ----------- |
| `taskId`  | UUID string | Yes      | The task ID |

Maps to: `POST /api/v1/tasks/owned/:id/unarchive`

### Snippet Tools

#### `list_snippets`

List snippets with optional filters.

| Parameter            | Type            | Required | Description                           |
| -------------------- | --------------- | -------- | ------------------------------------- |
| `postedBy`           | UUID string     | No       | Filter by poster                      |
| `mentionedUser`      | UUID string     | No       | Filter by mentioned user              |
| `mentionedUsergroup` | UUID string     | No       | Filter by mentioned usergroup         |
| `periodStart`        | ISO 8601 string | No       | Snippets posted at or after this time |
| `periodEnd`          | ISO 8601 string | No       | Snippets posted before this time      |
| `pageSize`           | integer         | No       | Max results (default 50, max 100)     |
| `pageToken`          | string          | No       | Cursor for next page                  |

Maps to: `GET /api/v1/snippets`

### Kudos Tools

#### `list_kudos`

List kudos entries with optional filters.

| Parameter     | Type            | Required | Description                        |
| ------------- | --------------- | -------- | ---------------------------------- |
| `postedBy`    | UUID string     | No       | Filter by sender                   |
| `user`        | UUID string     | No       | Filter by recipient                |
| `periodStart` | ISO 8601 string | No       | Kudos posted at or after this time |
| `periodEnd`   | ISO 8601 string | No       | Kudos posted before this time      |
| `pageSize`    | integer         | No       | Max results (default 50, max 100)  |
| `pageToken`   | string          | No       | Cursor for next page               |

Maps to: `GET /api/v1/kudos`

### Admin Tools

All admin tools require `admin` role. Returns an error if the authenticated user has `user` role.

#### `list_users`

List all users with optional search.

| Parameter   | Type    | Required | Description                       |
| ----------- | ------- | -------- | --------------------------------- |
| `query`     | string  | No       | Search by display name or email   |
| `pageSize`  | integer | No       | Max results (default 50, max 100) |
| `pageToken` | string  | No       | Cursor for next page              |

Maps to: `GET /api/v1/admin/users`

#### `deactivate_user`

Deactivate a user. Idempotent.

| Parameter | Type        | Required | Description |
| --------- | ----------- | -------- | ----------- |
| `userId`  | UUID string | Yes      | The user ID |

Maps to: `POST /api/v1/admin/users/:id/deactivate`

#### `list_snippet_channels`

List snippet-monitored Slack channels.

Maps to: `GET /api/v1/admin/snippetChannels`

#### `add_snippet_channel`

Add a snippet-monitored Slack channel. Idempotent.

| Parameter        | Type   | Required | Description                        |
| ---------------- | ------ | -------- | ---------------------------------- |
| `slackChannelId` | string | Yes      | Slack channel ID (e.g. `C1234ABC`) |

Maps to: `POST /api/v1/admin/snippetChannels`

#### `remove_snippet_channel`

Remove a snippet-monitored Slack channel.

| Parameter   | Type        | Required | Description           |
| ----------- | ----------- | -------- | --------------------- |
| `channelId` | UUID string | Yes      | The channel record ID |

Maps to: `DELETE /api/v1/admin/snippetChannels/:id`

#### `list_kudos_channels`

List kudos-monitored Slack channels.

Maps to: `GET /api/v1/admin/kudosChannels`

#### `add_kudos_channel`

Add a kudos-monitored Slack channel. Idempotent.

| Parameter        | Type   | Required | Description                        |
| ---------------- | ------ | -------- | ---------------------------------- |
| `slackChannelId` | string | Yes      | Slack channel ID (e.g. `C5678DEF`) |

Maps to: `POST /api/v1/admin/kudosChannels`

#### `remove_kudos_channel`

Remove a kudos-monitored Slack channel.

| Parameter   | Type        | Required | Description           |
| ----------- | ----------- | -------- | --------------------- |
| `channelId` | UUID string | Yes      | The channel record ID |

Maps to: `DELETE /api/v1/admin/kudosChannels/:id`

---

## MCP Resources

Resources provide read-only contextual data that AI assistants can use to understand the current state.

### `graphein://me`

Returns the authenticated user's profile. Useful for the AI assistant to understand the current user context.

```json
{
  "id": "uuid",
  "displayName": "Alice",
  "email": "alice@example.com",
  "role": "admin",
  "locale": "en"
}
```

---

## Implementation Structure

```
src/
├── mcp/
│   ├── server.ts           # McpServer setup, tool/resource registration
│   ├── auth-provider.ts    # OAuthServerProvider implementation
│   ├── tools/
│   │   ├── tasks.ts        # Task tools (list_assigned_tasks, archive_task, etc.)
│   │   ├── snippets.ts     # Snippet tools (list_snippets)
│   │   ├── kudos.ts        # Kudos tools (list_kudos)
│   │   └── admin.ts        # Admin tools (list_users, channel management)
│   └── resources/
│       └── me.ts           # graphein://me resource
├── oauth/
│   └── service.ts          # OAuth client, authorization code, refresh token management
├── db/
│   └── schema.ts           # oauth_clients, oauth_authorization_codes, oauth_refresh_tokens tables
├── app.ts                  # Mount MCP + OAuth endpoints
```

### OAuthServerProvider

The core of the OAuth integration. Implements `@modelcontextprotocol/sdk`'s `OAuthServerProvider` interface:

```typescript
// src/mcp/auth-provider.ts
import type { OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";

export class GrapheinOAuthProvider implements OAuthServerProvider {
  constructor(
    private oauthService: OAuthService,
    private userService: UserService,
    private session: SessionHelpers,
    private baseUrl: string,
    private mcpJwtSecret: string, // Separate from session JWT secret
  ) {}

  get clientsStore() {
    return {
      getClient: (clientId: string) => this.oauthService.getClient(clientId),
      registerClient: (metadata: OAuthClientMetadata) => this.oauthService.registerClient(metadata),
    };
  }

  async authorize(client, params, res) {
    // 1. Check if user has active Slack OIDC session (JWT cookie)
    // 2. If not logged in → redirect to /auth/slack with return URL
    // 3. If logged in → show consent page with client name + scopes
    // 4. On approval → generate authorization code, store in DB
    // 5. Redirect to client's redirect_uri with code
  }

  async challengeForAuthorizationCode(client, authorizationCode) {
    // Return the stored code_challenge for PKCE validation
    return this.oauthService.getCodeChallenge(authorizationCode);
  }

  async exchangeAuthorizationCode(client, authorizationCode) {
    // 1. Look up authorization code in DB
    // 2. Verify not expired, client_id matches, resource matches
    // 3. Delete the code (single use)
    // 4. Issue JWT access token (1h expiry, aud bound to resource)
    // 5. Issue opaque refresh token (30d expiry, stored in DB with resource)
    // 6. Return { access_token, token_type, expires_in, refresh_token }
  }

  async exchangeRefreshToken(client, refreshToken, resource) {
    // 1. Look up refresh token in DB
    // 2. Verify not expired, not revoked, client_id matches
    // 3. Verify resource matches the stored resource on the refresh token
    //    (reject if mismatched — prevents token reuse across resources)
    // 4. Rotate: revoke old token, issue new refresh token (same resource binding)
    // 5. Issue new JWT access token (aud bound to the stored resource)
  }

  async verifyAccessToken(token: string) {
    // 1. Verify JWT signature (HS256 with mcpJwtSecret)
    // 2. Check typ === "mcp+jwt", aud matches resource URL
    // 3. Check exp claim
    // 4. Look up user, verify not deactivated
    // 5. Return { token, clientId, scopes, expiresAt }
  }

  async revokeToken(client, request) {
    // Revoke refresh token (set revoked_at)
  }
}
```

### App Integration

```typescript
// src/app.ts (additions)
import { mcpAuthRouter, StreamableHTTPTransport } from "@hono/mcp";
import { contextStorage } from "hono/context-storage";
import { GrapheinOAuthProvider } from "./mcp/auth-provider";
import { createMcpServer } from "./mcp/server";

// Inside createHonoApp():

// 1. OAuth Authorization Server endpoints
const oauthProvider = new GrapheinOAuthProvider(
  oauthService,
  userService,
  session,
  config.baseUrl,
  mcpJwtSecret, // Separate from session JWT secret
);

app.route(
  "/",
  mcpAuthRouter({
    provider: oauthProvider,
    issuerUrl: config.baseUrl,
    resourceServerUrl: new URL(`${config.baseUrl}/mcp`),
    scopesSupported: ["graphein"],
    serviceDocumentationUrl: new URL(`${config.baseUrl}/api/v1/reference`),
  }),
);

// 2. MCP Streamable HTTP endpoint
//
// A new McpServer + StreamableHTTPTransport is created per request.
// The MCP SDK ties a single McpServer instance to one transport at a
// time, so sharing an instance across concurrent requests is unsafe.
// Since Graphein runs in stateless mode (no sessions, no subscriptions),
// per-request instantiation is the correct approach. The createMcpServer
// factory is lightweight — it only registers tool/resource definitions.
const mcpServerConfig = {
  /* services */
};

app.use("/mcp", contextStorage());
app.all("/mcp", async (c) => {
  // Verify Bearer token (JWT access token)
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({}, 401, {
      "WWW-Authenticate": `Bearer resource_metadata="${config.baseUrl}/.well-known/oauth-protected-resource/mcp"`,
    });
  }

  const tokenInfo = await oauthProvider.verifyAccessToken(authHeader.slice(7));
  if (!tokenInfo) {
    return c.json({}, 401, {
      "WWW-Authenticate": `Bearer resource_metadata="${config.baseUrl}/.well-known/oauth-protected-resource/mcp"`,
    });
  }

  // Set user context for tool handlers
  c.set("mcpUser", tokenInfo.user);
  c.set("mcpRole", tokenInfo.user.role);

  // Per-request server + transport (see comment above)
  const mcpServer = createMcpServer(mcpServerConfig);
  const transport = new StreamableHTTPTransport();
  await mcpServer.connect(transport);
  return transport.handleRequest(c);
});
```

### Accessing Auth Context in Tool Handlers

Use Hono's `contextStorage()` middleware to make the request context available inside MCP tool handlers:

```typescript
import { getContext } from "hono/context-storage";

// In tool handler:
server.registerTool("list_assigned_tasks", schema, async (params) => {
  const c = getContext();
  const user = c.get("mcpUser");
  const role = c.get("mcpRole");
  // ... use services to fetch data
});
```

### Consent Page

The OAuth authorize flow requires a consent page where the user approves the MCP client's access. This is a server-rendered page (consistent with the existing Web UI) showing:

- The MCP client name and redirect URI
- The requested scopes ("Access your Graphein tasks, snippets, and kudos")
- Approve / Deny buttons

If the user is not logged in (no valid JWT session cookie), they are redirected to `/auth/slack` with a return URL back to the authorization flow.

### Stateless MCP Mode

The MCP server runs in **stateless mode** — each HTTP request creates a new transport instance and processes the JSON-RPC message independently. This is simpler and sufficient for Graphein's use case since:

- All operations are short-lived request/response pairs (no long-running subscriptions)
- No server-to-client notifications are needed
- Authentication is per-request via Bearer token

---

## Error Handling

MCP tool errors are returned as JSON-RPC error responses with `isError: true`:

```typescript
// Authorization error
return {
  content: [
    {
      type: "text",
      text: JSON.stringify({
        error: { code: "forbidden", message: "Insufficient permissions" },
      }),
    },
  ],
  isError: true,
};

// Not found
return {
  content: [
    {
      type: "text",
      text: JSON.stringify({
        error: { code: "not_found", message: "Task not found" },
      }),
    },
  ],
  isError: true,
};
```

HTTP-level errors (401 Unauthorized, 403 Forbidden) are handled before reaching the MCP layer:

| HTTP Status | Condition                          | Response                                                                |
| ----------- | ---------------------------------- | ----------------------------------------------------------------------- |
| 401         | Missing or invalid access token    | `WWW-Authenticate: Bearer resource_metadata="..."`                      |
| 403         | Valid token but insufficient scope | `WWW-Authenticate: Bearer error="insufficient_scope", scope="graphein"` |

---

## Endpoint Summary

| Path                                        | Method    | Description                                                       |
| ------------------------------------------- | --------- | ----------------------------------------------------------------- |
| `/mcp`                                      | POST      | MCP JSON-RPC messages (tool calls, resource reads)                |
| `/mcp`                                      | GET       | SSE stream for server-to-client messages (stateless: returns 405) |
| `/mcp`                                      | DELETE    | Session termination (stateless: returns 405)                      |
| `/oauth/authorize`                          | GET, POST | OAuth 2.1 authorization endpoint                                  |
| `/oauth/token`                              | POST      | OAuth 2.1 token endpoint                                          |
| `/oauth/register`                           | POST      | Dynamic client registration (RFC 7591)                            |
| `/oauth/revoke`                             | POST      | Token revocation                                                  |
| `/.well-known/oauth-protected-resource/mcp` | GET       | Protected Resource Metadata (RFC 9728)                            |
| `/.well-known/oauth-authorization-server`   | GET       | Authorization Server Metadata (RFC 8414)                          |

---

## Configuration

| Variable         | Description                                                     | Required       |
| ---------------- | --------------------------------------------------------------- | -------------- |
| `BASE_URL`       | Existing. Used as the OAuth issuer URL and resource server base | Yes (existing) |
| `MCP_JWT_SECRET` | Dedicated signing key for MCP OAuth access tokens (HS256)       | Yes (new)      |

`MCP_JWT_SECRET` must be different from `JWT_SECRET` (used for browser session tokens) to prevent cross-boundary token confusion.

---

## Dependencies

| Package                     | Purpose                                              |
| --------------------------- | ---------------------------------------------------- |
| `@hono/mcp`                 | Hono MCP transport adapter + OAuth AS endpoints      |
| `@modelcontextprotocol/sdk` | MCP server SDK (peer dep of @hono/mcp)               |
| `hono-rate-limiter`         | OAuth endpoint rate limiting (peer dep of @hono/mcp) |

Both `hono` and `zod` are already in the project's dependencies.

---

## Future Considerations

- **Fine-grained scopes**: Add scopes like `tasks:read`, `tasks:write`, `admin` for more granular access control.
- **MCP Prompts**: Predefined prompt templates (e.g., "summarize my tasks", "weekly snippet digest") could be added as MCP prompts.
- **Stateful sessions**: If long-running operations or real-time updates become necessary, the transport can be upgraded to stateful mode with session management.
- **Additional tools**: Write operations (e.g., creating tasks via MCP) could be added as the API surface grows.

## References

- [MCP Specification](https://modelcontextprotocol.io/specification)
- [MCP Authorization](https://modelcontextprotocol.io/specification/draft/basic/authorization)
- [MCP Streamable HTTP Transport](https://modelcontextprotocol.io/specification/draft/basic/transports#streamable-http)
- [RFC 8414 — OAuth 2.0 Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
- [RFC 9728 — OAuth 2.0 Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
- [RFC 7591 — OAuth 2.0 Dynamic Client Registration](https://datatracker.ietf.org/doc/html/rfc7591)
- [@hono/mcp](https://github.com/honojs/middleware/tree/main/packages/mcp)
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- [Hono Context Storage](https://hono.dev/docs/middleware/builtin/context-storage)
