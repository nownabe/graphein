import { test, expect } from "@playwright/test";
import { sign } from "hono/jwt";
import { env } from "./helpers/env";
import { findUserBySlackId, query } from "./helpers/db";
import {
  registerOAuthClient,
  performOAuthFlow,
  refreshAccessToken,
  revokeToken,
  mcpRequest,
  mcpToolCall,
  mcpResourceRead,
  createMcpAccessToken,
} from "./helpers/mcp";

// ---------------------------------------------------------------------------
// OAuth Flow
// ---------------------------------------------------------------------------

test.describe("MCP OAuth flow", () => {
  test("unauthenticated request to /mcp returns 401 with WWW-Authenticate header", async () => {
    const res = await fetch(`${env.grapheinUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });

    expect(res.status).toBe(401);
    const wwwAuth = res.headers.get("WWW-Authenticate");
    expect(wwwAuth).toBeTruthy();
    expect(wwwAuth).toContain("Bearer");
    expect(wwwAuth).toContain("resource_metadata");
  });

  test("discovery endpoints return correct metadata", async () => {
    const [authServerRes, resourceRes] = await Promise.all([
      fetch(`${env.grapheinUrl}/.well-known/oauth-authorization-server`),
      fetch(`${env.grapheinUrl}/.well-known/oauth-protected-resource/mcp`),
    ]);

    expect(authServerRes.status).toBe(200);
    const authMeta = await authServerRes.json();
    expect(authMeta.issuer).toBe(env.grapheinUrl);
    expect(authMeta.token_endpoint).toContain("/oauth/token");
    expect(authMeta.authorization_endpoint).toContain("/oauth/authorize");
    expect(authMeta.registration_endpoint).toContain("/oauth/register");
    expect(authMeta.revocation_endpoint).toContain("/oauth/revoke");
    expect(authMeta.scopes_supported).toContain("graphein");
    expect(authMeta.code_challenge_methods_supported).toContain("S256");

    expect(resourceRes.status).toBe(200);
    const resMeta = await resourceRes.json();
    expect(resMeta.resource).toContain("/mcp");
  });

  test("dynamic client registration via POST /oauth/register", async () => {
    const client = await registerOAuthClient("E2E Registration Test");
    expect(client.clientId).toBeTruthy();
    expect(typeof client.clientId).toBe("string");
  });

  test("authorization code flow with PKCE (S256)", async () => {
    const client = await registerOAuthClient("E2E PKCE Test");
    const tokens = await performOAuthFlow(client.clientId);

    expect(tokens.access_token).toBeTruthy();
    expect(tokens.token_type).toBe("Bearer");
    expect(tokens.expires_in).toBeGreaterThan(0);
    expect(tokens.refresh_token).toBeTruthy();
    expect(tokens.scope).toBe("graphein");
  });

  test("refresh token rotation", async () => {
    const client = await registerOAuthClient("E2E Refresh Test");
    const tokens = await performOAuthFlow(client.clientId);

    // Use refresh token to get a new access token
    const refreshed = await refreshAccessToken(client.clientId, tokens.refresh_token!);
    expect(refreshed.access_token).toBeTruthy();
    expect(refreshed.access_token).not.toBe(tokens.access_token);
    expect(refreshed.refresh_token).toBeTruthy();
    expect(refreshed.refresh_token).not.toBe(tokens.refresh_token);

    // Original refresh token should no longer work (rotation)
    await expect(refreshAccessToken(client.clientId, tokens.refresh_token!)).rejects.toThrow();
  });

  test("token revocation", async () => {
    const client = await registerOAuthClient("E2E Revoke Test");
    const tokens = await performOAuthFlow(client.clientId);

    // Revoke the refresh token
    const revokeRes = await revokeToken(client.clientId, tokens.refresh_token!);
    expect(revokeRes.ok).toBe(true);

    // Revoked refresh token should no longer work
    await expect(refreshAccessToken(client.clientId, tokens.refresh_token!)).rejects.toThrow();
  });

  test("expired token is rejected", async () => {
    const user = await findUserBySlackId(env.slackUserId);
    expect(user).toBeDefined();

    // Create an already-expired access token
    const now = Math.floor(Date.now() / 1000);
    const expiredToken = await sign(
      {
        sub: user!.id as string,
        aud: `${env.grapheinUrl}/mcp`,
        scope: "graphein",
        typ: "mcp+jwt",
        exp: now - 60, // expired 1 minute ago
        iat: now - 120,
      },
      env.mcpJwtSecret,
      "HS256",
    );

    const res = await mcpRequest(expiredToken, "tools/list");
    expect(res.status).toBe(401);
  });

  test("invalid token is rejected", async () => {
    const res = await mcpRequest("totally-invalid-token", "tools/list");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// MCP Tools
// ---------------------------------------------------------------------------

test.describe("MCP tools", () => {
  let accessToken: string;
  let userId: string;
  let originalRole: string;

  test.beforeAll(async () => {
    const user = await findUserBySlackId(env.slackUserId);
    if (!user) throw new Error("E2E test user not found");
    userId = user.id as string;
    originalRole = user.role as string;

    // Ensure user has non-admin role for these tests
    await query("UPDATE users SET role = 'user' WHERE id = $1", [userId]);
    accessToken = await createMcpAccessToken(userId);
  });

  test.afterAll(async () => {
    // Restore original role
    await query("UPDATE users SET role = $1 WHERE id = $2", [originalRole, userId]);
  });

  test("tools/list returns available tools", async () => {
    const res = await mcpRequest(accessToken, "tools/list");
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.result).toBeDefined();
    const toolNames = body.result.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain("list_assigned_tasks");
    expect(toolNames).toContain("list_owned_tasks");
    expect(toolNames).toContain("list_task_assignees");
    expect(toolNames).toContain("archive_task");
    expect(toolNames).toContain("unarchive_task");
    expect(toolNames).toContain("list_snippets");
    expect(toolNames).toContain("list_kudos");
    expect(toolNames).toContain("list_users");
  });

  test("list_assigned_tasks returns tasks for authenticated user", async () => {
    const result = await mcpToolCall(accessToken, "list_assigned_tasks", {
      status: "active",
    });
    expect(result.result).toBeDefined();

    const content = (result.result as { content: { text: string }[] }).content[0].text;
    const data = JSON.parse(content);
    expect(data).toHaveProperty("tasks");
    expect(data).toHaveProperty("totalSize");
    expect(Array.isArray(data.tasks)).toBe(true);
  });

  test("list_owned_tasks returns tasks for authenticated user", async () => {
    const result = await mcpToolCall(accessToken, "list_owned_tasks", {
      status: "active",
    });
    expect(result.result).toBeDefined();

    const content = (result.result as { content: { text: string }[] }).content[0].text;
    const data = JSON.parse(content);
    expect(data).toHaveProperty("tasks");
    expect(data).toHaveProperty("totalSize");
  });

  test("admin tool returns forbidden for non-admin user", async () => {
    const result = await mcpToolCall(accessToken, "list_users", {});
    expect(result.result).toBeDefined();

    const content = (result.result as { content: { text: string }[]; isError?: boolean }).content[0]
      .text;
    const data = JSON.parse(content);
    expect(data.error).toBeDefined();
    expect(data.error.code).toBe("forbidden");
  });

  test("list_task_assignees returns not_found for non-existent task", async () => {
    const result = await mcpToolCall(accessToken, "list_task_assignees", {
      taskId: "00000000-0000-0000-0000-000000000000",
    });
    expect(result.result).toBeDefined();

    const content = (result.result as { content: { text: string }[] }).content[0].text;
    const data = JSON.parse(content);
    expect(data.error).toBeDefined();
    expect(data.error.code).toBe("not_found");
  });
});

test.describe("MCP admin tools", () => {
  let accessToken: string;
  let userId: string;
  let originalRole: string;

  test.beforeAll(async () => {
    const user = await findUserBySlackId(env.slackUserId);
    if (!user) throw new Error("E2E test user not found");
    userId = user.id as string;
    originalRole = user.role as string;

    // Promote the test user to admin for admin tool tests
    await query("UPDATE users SET role = 'admin' WHERE id = $1", [userId]);
    accessToken = await createMcpAccessToken(userId);
  });

  test.afterAll(async () => {
    // Restore original role
    await query("UPDATE users SET role = $1 WHERE id = $2", [originalRole, userId]);
  });

  test("list_users succeeds for admin", async () => {
    const result = await mcpToolCall(accessToken, "list_users", {});
    expect(result.result).toBeDefined();

    const content = (result.result as { content: { text: string }[] }).content[0].text;
    const data = JSON.parse(content);
    expect(data).toHaveProperty("users");
    expect(data).toHaveProperty("totalSize");
    expect(data.totalSize).toBeGreaterThan(0);
    expect(Array.isArray(data.users)).toBe(true);

    // Verify the response includes expected user fields
    const firstUser = data.users[0];
    expect(firstUser).toHaveProperty("id");
    expect(firstUser).toHaveProperty("displayName");
    expect(firstUser).toHaveProperty("email");
    expect(firstUser).toHaveProperty("role");
  });

  test("list_snippet_channels succeeds for admin", async () => {
    const result = await mcpToolCall(accessToken, "list_snippet_channels", {});
    expect(result.result).toBeDefined();

    const content = (result.result as { content: { text: string }[] }).content[0].text;
    const data = JSON.parse(content);
    expect(data).toHaveProperty("snippetChannels");
  });

  test("list_kudos_channels succeeds for admin", async () => {
    const result = await mcpToolCall(accessToken, "list_kudos_channels", {});
    expect(result.result).toBeDefined();

    const content = (result.result as { content: { text: string }[] }).content[0].text;
    const data = JSON.parse(content);
    expect(data).toHaveProperty("kudosChannels");
  });

  test("pagination via pageToken", async () => {
    // Request with pageSize=1 to force pagination
    const result = await mcpToolCall(accessToken, "list_users", { pageSize: 1 });
    expect(result.result).toBeDefined();

    const content = (result.result as { content: { text: string }[] }).content[0].text;
    const data = JSON.parse(content);

    if (data.totalSize > 1) {
      // Should have a nextPageToken when there are more results
      expect(data.nextPageToken).toBeTruthy();
      expect(data.users).toHaveLength(1);

      // Fetch second page
      const page2Result = await mcpToolCall(accessToken, "list_users", {
        pageSize: 1,
        pageToken: data.nextPageToken,
      });
      const page2Content = (page2Result.result as { content: { text: string }[] }).content[0].text;
      const page2Data = JSON.parse(page2Content);
      expect(page2Data.users).toHaveLength(1);
      expect(page2Data.users[0].id).not.toBe(data.users[0].id);
    }
  });
});

// ---------------------------------------------------------------------------
// MCP Resources
// ---------------------------------------------------------------------------

test.describe("MCP resources", () => {
  let accessToken: string;

  test.beforeAll(async () => {
    const user = await findUserBySlackId(env.slackUserId);
    if (!user) throw new Error("E2E test user not found");
    accessToken = await createMcpAccessToken(user.id as string);
  });

  test("graphein://me returns authenticated user profile", async () => {
    const result = await mcpResourceRead(accessToken, "graphein://me");
    expect(result.result).toBeDefined();

    const contents = (result.result as { contents: { uri: string; text: string }[] }).contents;
    expect(contents).toHaveLength(1);
    expect(contents[0].uri).toBe("graphein://me");

    const profile = JSON.parse(contents[0].text);
    expect(profile).toHaveProperty("id");
    expect(profile).toHaveProperty("displayName");
    expect(profile).toHaveProperty("email");
    expect(profile).toHaveProperty("role");
    expect(profile).toHaveProperty("locale");
  });
});
