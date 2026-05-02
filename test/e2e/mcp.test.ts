import { test, expect } from "@playwright/test";
import { sign } from "hono/jwt";
import { env } from "./helpers/env";
import { findUserBySlackId, query, ensureUser } from "./helpers/db";
import {
  registerOAuthClient,
  performOAuthFlow,
  refreshAccessToken,
  revokeToken,
  mcpRequest,
  mcpToolCall,
  mcpResourceRead,
  createMcpAccessToken,
  parseJsonRpcResponse,
} from "./helpers/mcp";

// ---------------------------------------------------------------------------
// Helper: parse tool call JSON result
// ---------------------------------------------------------------------------

function parseToolResult(result: unknown): Record<string, unknown> {
  const content = (result as { content: { text: string }[] }).content[0].text;
  return JSON.parse(content);
}

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

  test("refresh token rotation without resource parameter", async () => {
    const client = await registerOAuthClient("E2E Refresh No Resource Test");
    const tokens = await performOAuthFlow(client.clientId);

    // Refresh without sending the resource parameter
    const refreshed = await refreshAccessToken(client.clientId, tokens.refresh_token!, {
      includeResource: false,
    });
    expect(refreshed.access_token).toBeTruthy();
    expect(refreshed.access_token).not.toBe(tokens.access_token);
    expect(refreshed.refresh_token).toBeTruthy();
    expect(refreshed.refresh_token).not.toBe(tokens.refresh_token);
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
    const body = await parseJsonRpcResponse(res);
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

// ---------------------------------------------------------------------------
// Task tool behavior: archive, unarchive, assignees, filters
// ---------------------------------------------------------------------------

test.describe("MCP task tool behavior", () => {
  const NIL_UUID = "00000000-0000-0000-0000-000000000000";

  let ownerToken: string;
  let ownerId: string;
  let otherToken: string;
  let otherId: string;
  let originalOwnerRole: string;
  // Two tasks seeded so that pagination tests are deterministic
  let taskId: string;
  let taskId2: string;

  test.beforeAll(async () => {
    // Primary user (owner of the test tasks)
    const owner = await findUserBySlackId(env.slackUserId);
    if (!owner) throw new Error("E2E test user not found");
    ownerId = owner.id as string;
    originalOwnerRole = owner.role as string;
    await query("UPDATE users SET role = 'user' WHERE id = $1", [ownerId]);
    ownerToken = await createMcpAccessToken(ownerId);

    // Secondary user (not an owner)
    const other = await ensureUser("UMCPOTHER01", {
      email: "mcp-other@test.local",
      displayName: "MCP Other User",
    });
    otherId = other.id as string;
    await query("UPDATE users SET role = 'user' WHERE id = $1", [otherId]);
    otherToken = await createMcpAccessToken(otherId);

    // Create first task owned and assigned to the primary user
    const [task] = await query<{ id: string }>(
      `INSERT INTO tasks (title, description, created_by_id, deadline)
       VALUES ('MCP archive test', 'Test task for archive/unarchive', $1, $2)
       RETURNING id`,
      [ownerId, new Date("2026-06-15T00:00:00Z").toISOString()],
    );
    taskId = task.id;

    await query(
      "INSERT INTO task_owners (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [taskId, ownerId],
    );
    await query(
      "INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [taskId, ownerId],
    );
    await query(
      "INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [taskId, otherId],
    );

    // Create second task for pagination coverage
    const [task2] = await query<{ id: string }>(
      `INSERT INTO tasks (title, description, created_by_id, deadline)
       VALUES ('MCP pagination test', 'Second task for pagination', $1, $2)
       RETURNING id`,
      [ownerId, new Date("2026-07-01T00:00:00Z").toISOString()],
    );
    taskId2 = task2.id;

    await query(
      "INSERT INTO task_owners (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [taskId2, ownerId],
    );
    await query(
      "INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [taskId2, ownerId],
    );
  });

  test.afterAll(async () => {
    await query("DELETE FROM tasks WHERE id = ANY($1::uuid[])", [[taskId, taskId2]]);
    await query("UPDATE users SET role = $1 WHERE id = $2", [originalOwnerRole, ownerId]);
  });

  // -- archive_task --

  test("archive_task succeeds for task owner", async () => {
    // Ensure task starts as active
    await query("UPDATE tasks SET archived = false WHERE id = $1", [taskId]);
    const result = await mcpToolCall(ownerToken, "archive_task", { taskId });
    const data = parseToolResult(result.result);
    expect(data.id).toBe(taskId);
    expect(data.archived).toBe(true);
    expect(data.updatedAt).toBeTruthy();
  });

  test("archive_task is idempotent", async () => {
    // Ensure task is already archived
    await query("UPDATE tasks SET archived = true WHERE id = $1", [taskId]);
    const result = await mcpToolCall(ownerToken, "archive_task", { taskId });
    const data = parseToolResult(result.result);
    expect(data.id).toBe(taskId);
    expect(data.archived).toBe(true);
  });

  test("list_assigned_tasks with status=archived returns archived task", async () => {
    await query("UPDATE tasks SET archived = true WHERE id = $1", [taskId]);
    const result = await mcpToolCall(ownerToken, "list_assigned_tasks", { status: "archived" });
    const data = parseToolResult(result.result);
    const found = (data.tasks as { id: string }[]).find((t) => t.id === taskId);
    expect(found).toBeDefined();
  });

  test("list_assigned_tasks with status=active excludes archived task", async () => {
    await query("UPDATE tasks SET archived = true WHERE id = $1", [taskId]);
    const result = await mcpToolCall(ownerToken, "list_assigned_tasks", { status: "active" });
    const data = parseToolResult(result.result);
    const found = (data.tasks as { id: string }[]).find((t) => t.id === taskId);
    expect(found).toBeUndefined();
  });

  // -- unarchive_task --

  test("unarchive_task succeeds for task owner", async () => {
    // Ensure task is archived first
    await query("UPDATE tasks SET archived = true WHERE id = $1", [taskId]);
    const result = await mcpToolCall(ownerToken, "unarchive_task", { taskId });
    const data = parseToolResult(result.result);
    expect(data.id).toBe(taskId);
    expect(data.archived).toBe(false);
  });

  test("unarchive_task is idempotent", async () => {
    // Ensure task is already active
    await query("UPDATE tasks SET archived = false WHERE id = $1", [taskId]);
    const result = await mcpToolCall(ownerToken, "unarchive_task", { taskId });
    const data = parseToolResult(result.result);
    expect(data.archived).toBe(false);
  });

  // -- authorization failures --

  test("archive_task returns forbidden for non-owner", async () => {
    const result = await mcpToolCall(otherToken, "archive_task", { taskId });
    const data = parseToolResult(result.result);
    expect(data.error).toBeDefined();
    expect((data.error as { code: string }).code).toBe("forbidden");
  });

  test("unarchive_task returns forbidden for non-owner", async () => {
    const result = await mcpToolCall(otherToken, "unarchive_task", { taskId });
    const data = parseToolResult(result.result);
    expect(data.error).toBeDefined();
    expect((data.error as { code: string }).code).toBe("forbidden");
  });

  test("archive_task returns not_found for non-existent task", async () => {
    const result = await mcpToolCall(ownerToken, "archive_task", { taskId: NIL_UUID });
    const data = parseToolResult(result.result);
    expect(data.error).toBeDefined();
    expect((data.error as { code: string }).code).toBe("not_found");
  });

  test("unarchive_task returns not_found for non-existent task", async () => {
    const result = await mcpToolCall(ownerToken, "unarchive_task", { taskId: NIL_UUID });
    const data = parseToolResult(result.result);
    expect(data.error).toBeDefined();
    expect((data.error as { code: string }).code).toBe("not_found");
  });

  // -- list_task_assignees --

  test("list_task_assignees returns assignees for task owner", async () => {
    const result = await mcpToolCall(ownerToken, "list_task_assignees", { taskId });
    const data = parseToolResult(result.result);
    expect(data.taskId).toBe(taskId);
    expect(data.totalSize).toBe(2);
    const assignees = data.assignees as { userId: string; displayName: string; done: boolean }[];
    expect(assignees).toHaveLength(2);
    const userIds = assignees.map((a) => a.userId);
    expect(userIds).toContain(ownerId);
    expect(userIds).toContain(otherId);
    for (const a of assignees) {
      expect(a).toHaveProperty("displayName");
      expect(typeof a.done).toBe("boolean");
    }
  });

  test("list_task_assignees returns forbidden for non-owner", async () => {
    const result = await mcpToolCall(otherToken, "list_task_assignees", { taskId });
    const data = parseToolResult(result.result);
    expect(data.error).toBeDefined();
    expect((data.error as { code: string }).code).toBe("forbidden");
  });

  // -- deadline filters --

  test("list_assigned_tasks deadlineBefore filter works", async () => {
    await query("UPDATE tasks SET archived = false WHERE id = $1", [taskId]);
    const result = await mcpToolCall(ownerToken, "list_assigned_tasks", {
      deadlineBefore: "2026-07-01T00:00:00Z",
    });
    const data = parseToolResult(result.result);
    const found = (data.tasks as { id: string }[]).find((t) => t.id === taskId);
    expect(found).toBeDefined();
  });

  test("list_assigned_tasks deadlineBefore filter excludes later tasks", async () => {
    await query("UPDATE tasks SET archived = false WHERE id = $1", [taskId]);
    const result = await mcpToolCall(ownerToken, "list_assigned_tasks", {
      deadlineBefore: "2026-01-01T00:00:00Z",
    });
    const data = parseToolResult(result.result);
    const found = (data.tasks as { id: string }[]).find((t) => t.id === taskId);
    expect(found).toBeUndefined();
  });

  test("list_assigned_tasks rejects invalid ISO 8601 date", async () => {
    const result = await mcpToolCall(ownerToken, "list_assigned_tasks", {
      deadlineBefore: "not-a-date",
    });
    const data = parseToolResult(result.result);
    expect(data.error).toBeDefined();
    expect((data.error as { code: string }).code).toBe("validation_error");
  });

  // -- pagination for assigned tasks (two tasks seeded, so nextPageToken is guaranteed) --

  test("list_assigned_tasks pagination with pageSize=1", async () => {
    // Ensure both tasks are active
    await query("UPDATE tasks SET archived = false WHERE id = ANY($1::uuid[])", [
      [taskId, taskId2],
    ]);
    const result = await mcpToolCall(ownerToken, "list_assigned_tasks", { pageSize: 1 });
    const data = parseToolResult(result.result);
    expect((data.tasks as unknown[]).length).toBe(1);
    expect(data.totalSize as number).toBeGreaterThanOrEqual(2);
    expect(data.nextPageToken).toBeTruthy();

    const page2 = await mcpToolCall(ownerToken, "list_assigned_tasks", {
      pageSize: 1,
      pageToken: data.nextPageToken as string,
    });
    const page2Data = parseToolResult(page2.result);
    expect((page2Data.tasks as { id: string }[])[0].id).not.toBe(
      (data.tasks as { id: string }[])[0].id,
    );
  });

  // -- pageToken mismatch (uses the two seeded tasks to guarantee a token exists) --

  test("list_assigned_tasks rejects pageToken with mismatched filters", async () => {
    // Ensure both tasks are active so we get a nextPageToken
    await query("UPDATE tasks SET archived = false WHERE id = ANY($1::uuid[])", [
      [taskId, taskId2],
    ]);
    // Get a valid token with status=active
    const result = await mcpToolCall(ownerToken, "list_assigned_tasks", {
      status: "active",
      pageSize: 1,
    });
    const data = parseToolResult(result.result);
    expect(data.nextPageToken).toBeTruthy();

    // Use that token with status=archived (different fingerprint)
    const mismatch = await mcpToolCall(ownerToken, "list_assigned_tasks", {
      status: "archived",
      pageToken: data.nextPageToken as string,
    });
    const mismatchData = parseToolResult(mismatch.result);
    expect(mismatchData.error).toBeDefined();
    expect((mismatchData.error as { code: string }).code).toBe("validation_error");
  });

  // -- task response field verification --

  test("list_assigned_tasks response includes expected fields", async () => {
    await query("UPDATE tasks SET archived = false WHERE id = $1", [taskId]);
    const result = await mcpToolCall(ownerToken, "list_assigned_tasks", {});
    const data = parseToolResult(result.result);
    expect(data).toHaveProperty("tasks");
    expect(data).toHaveProperty("totalSize");
    expect(typeof data.totalSize).toBe("number");

    const tasks = data.tasks as Record<string, unknown>[];
    const t = tasks.find((t) => t.id === taskId);
    expect(t).toBeDefined();
    expect(t).toHaveProperty("id");
    expect(t).toHaveProperty("title");
    expect(t).toHaveProperty("archived");
    expect(t).toHaveProperty("done");
    expect(t).toHaveProperty("createdBy");
    expect(t).toHaveProperty("createdAt");
    expect(t).toHaveProperty("updatedAt");
  });

  test("list_owned_tasks response includes progress field", async () => {
    await query("UPDATE tasks SET archived = false WHERE id = $1", [taskId]);
    const result = await mcpToolCall(ownerToken, "list_owned_tasks", {});
    const data = parseToolResult(result.result);
    const tasks = data.tasks as Record<string, unknown>[];
    const t = tasks.find((t) => t.id === taskId);
    expect(t).toBeDefined();
    expect(t).toHaveProperty("progress");
    const progress = t!.progress as { total: number; done: number };
    expect(typeof progress.total).toBe("number");
    expect(typeof progress.done).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// Snippet tool behavior
// ---------------------------------------------------------------------------

test.describe("MCP snippet tool behavior", () => {
  let accessToken: string;
  let userId: string;
  let originalRole: string;
  let snippetId: string;
  let snippetId2: string;
  let otherId: string;

  test.beforeAll(async () => {
    const user = await findUserBySlackId(env.slackUserId);
    if (!user) throw new Error("E2E test user not found");
    userId = user.id as string;
    originalRole = user.role as string;
    await query("UPDATE users SET role = 'user' WHERE id = $1", [userId]);
    accessToken = await createMcpAccessToken(userId);

    const other = await ensureUser("UMCPSNIP01", {
      email: "mcp-snippet@test.local",
      displayName: "MCP Snippet User",
    });
    otherId = other.id as string;

    // Seed first snippet posted by the primary user
    const [snippet] = await query<{ id: string }>(
      `INSERT INTO snippets (content, posted_at, slack_permalink, posted_by_id)
       VALUES ('Daily standup snippet for MCP test', $1, 'https://slack.test/snippet1', $2)
       RETURNING id`,
      [new Date("2026-04-15T09:00:00Z").toISOString(), userId],
    );
    snippetId = snippet.id;

    // Add a user mention
    await query(
      "INSERT INTO snippet_mentioned_users (snippet_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [snippetId, otherId],
    );

    // Seed second snippet for pagination coverage
    const [snippet2] = await query<{ id: string }>(
      `INSERT INTO snippets (content, posted_at, slack_permalink, posted_by_id)
       VALUES ('Second snippet for pagination', $1, 'https://slack.test/snippet2', $2)
       RETURNING id`,
      [new Date("2026-04-16T09:00:00Z").toISOString(), userId],
    );
    snippetId2 = snippet2.id;
  });

  test.afterAll(async () => {
    await query("DELETE FROM snippets WHERE id = ANY($1::uuid[])", [[snippetId, snippetId2]]);
    await query("UPDATE users SET role = $1 WHERE id = $2", [originalRole, userId]);
  });

  test("list_snippets returns seeded snippet", async () => {
    const result = await mcpToolCall(accessToken, "list_snippets", {});
    const data = parseToolResult(result.result);
    expect(data).toHaveProperty("snippets");
    expect(data).toHaveProperty("totalSize");
    expect(data.totalSize as number).toBeGreaterThan(0);

    const found = (data.snippets as { id: string }[]).find((s) => s.id === snippetId);
    expect(found).toBeDefined();
  });

  test("list_snippets response includes expected fields", async () => {
    const result = await mcpToolCall(accessToken, "list_snippets", {});
    const data = parseToolResult(result.result);
    const snippets = data.snippets as Record<string, unknown>[];
    const s = snippets.find((s) => s.id === snippetId);
    expect(s).toBeDefined();
    expect(s!.content).toBe("Daily standup snippet for MCP test");
    expect(s!.postedAt).toBeTruthy();
    expect(s!.slackPermalink).toBe("https://slack.test/snippet1");
    expect(s!.postedBy).toBeDefined();
    const poster = s!.postedBy as { id: string; displayName: string };
    expect(poster.id).toBe(userId);
    expect(poster.displayName).toBeTruthy();
    expect(s!.mentionedUsers).toBeDefined();
    expect(s!.mentionedUsergroups).toBeDefined();
  });

  test("list_snippets postedBy filter returns only matching snippets", async () => {
    const result = await mcpToolCall(accessToken, "list_snippets", { postedBy: userId });
    const data = parseToolResult(result.result);
    const snippets = data.snippets as { id: string }[];
    const found = snippets.find((s) => s.id === snippetId);
    expect(found).toBeDefined();
  });

  test("list_snippets postedBy filter with non-matching user returns empty", async () => {
    const result = await mcpToolCall(accessToken, "list_snippets", { postedBy: otherId });
    const data = parseToolResult(result.result);
    const snippets = data.snippets as { id: string }[];
    const found = snippets.find((s) => s.id === snippetId);
    expect(found).toBeUndefined();
  });

  test("list_snippets mentionedUser filter works", async () => {
    const result = await mcpToolCall(accessToken, "list_snippets", { mentionedUser: otherId });
    const data = parseToolResult(result.result);
    const found = (data.snippets as { id: string }[]).find((s) => s.id === snippetId);
    expect(found).toBeDefined();
  });

  test("list_snippets period filter includes snippet in range", async () => {
    const result = await mcpToolCall(accessToken, "list_snippets", {
      periodStart: "2026-04-01T00:00:00Z",
      periodEnd: "2026-05-01T00:00:00Z",
    });
    const data = parseToolResult(result.result);
    const found = (data.snippets as { id: string }[]).find((s) => s.id === snippetId);
    expect(found).toBeDefined();
  });

  test("list_snippets period filter excludes snippet outside range", async () => {
    const result = await mcpToolCall(accessToken, "list_snippets", {
      periodStart: "2026-05-01T00:00:00Z",
      periodEnd: "2026-06-01T00:00:00Z",
    });
    const data = parseToolResult(result.result);
    const found = (data.snippets as { id: string }[]).find((s) => s.id === snippetId);
    expect(found).toBeUndefined();
  });

  test("list_snippets rejects invalid periodStart", async () => {
    const result = await mcpToolCall(accessToken, "list_snippets", {
      periodStart: "bad-date",
    });
    const data = parseToolResult(result.result);
    expect(data.error).toBeDefined();
    expect((data.error as { code: string }).code).toBe("validation_error");
  });

  test("list_snippets pagination works", async () => {
    // Filter to just our seeded user to guarantee exactly 2 snippets
    const result = await mcpToolCall(accessToken, "list_snippets", {
      postedBy: userId,
      pageSize: 1,
    });
    const data = parseToolResult(result.result);
    expect((data.snippets as unknown[]).length).toBe(1);
    expect(data.totalSize as number).toBeGreaterThanOrEqual(2);
    expect(data.nextPageToken).toBeTruthy();

    const page2 = await mcpToolCall(accessToken, "list_snippets", {
      postedBy: userId,
      pageSize: 1,
      pageToken: data.nextPageToken as string,
    });
    const page2Data = parseToolResult(page2.result);
    expect((page2Data.snippets as { id: string }[])[0].id).not.toBe(
      (data.snippets as { id: string }[])[0].id,
    );
  });
});

// ---------------------------------------------------------------------------
// Kudos tool behavior
// ---------------------------------------------------------------------------

test.describe("MCP kudos tool behavior", () => {
  let accessToken: string;
  let userId: string;
  let originalRole: string;
  let kudosId: string;
  let kudosId2: string;
  let entryId: string;
  let otherId: string;

  test.beforeAll(async () => {
    const user = await findUserBySlackId(env.slackUserId);
    if (!user) throw new Error("E2E test user not found");
    userId = user.id as string;
    originalRole = user.role as string;
    await query("UPDATE users SET role = 'user' WHERE id = $1", [userId]);
    accessToken = await createMcpAccessToken(userId);

    const other = await ensureUser("UMCPKUDO01", {
      email: "mcp-kudos@test.local",
      displayName: "MCP Kudos User",
    });
    otherId = other.id as string;

    // Seed first kudos record
    const [k] = await query<{ id: string }>(
      `INSERT INTO kudos (posted_at, slack_permalink, posted_by_id)
       VALUES ($1, 'https://slack.test/kudos1', $2)
       RETURNING id`,
      [new Date("2026-04-20T10:00:00Z").toISOString(), userId],
    );
    kudosId = k.id;

    // Seed first kudos entry
    const [entry] = await query<{ id: string }>(
      `INSERT INTO kudos_entries (kudos_id, message) VALUES ($1, 'Great job on the release!') RETURNING id`,
      [kudosId],
    );
    entryId = entry.id;

    // Add mentioned user to the first entry
    await query(
      "INSERT INTO kudos_entry_mentioned_users (kudos_entry_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [entryId, otherId],
    );

    // Seed second kudos record for pagination coverage
    const [k2] = await query<{ id: string }>(
      `INSERT INTO kudos (posted_at, slack_permalink, posted_by_id)
       VALUES ($1, 'https://slack.test/kudos2', $2)
       RETURNING id`,
      [new Date("2026-04-21T10:00:00Z").toISOString(), userId],
    );
    kudosId2 = k2.id;

    await query(`INSERT INTO kudos_entries (kudos_id, message) VALUES ($1, 'Awesome teamwork!')`, [
      kudosId2,
    ]);
  });

  test.afterAll(async () => {
    await query("DELETE FROM kudos WHERE id = ANY($1::uuid[])", [[kudosId, kudosId2]]);
    await query("UPDATE users SET role = $1 WHERE id = $2", [originalRole, userId]);
  });

  test("list_kudos returns seeded kudos entry", async () => {
    const result = await mcpToolCall(accessToken, "list_kudos", {});
    const data = parseToolResult(result.result);
    expect(data).toHaveProperty("kudos");
    expect(data).toHaveProperty("totalSize");
    expect(data.totalSize as number).toBeGreaterThan(0);

    const found = (data.kudos as { id: string }[]).find((k) => k.id === entryId);
    expect(found).toBeDefined();
  });

  test("list_kudos response includes expected fields", async () => {
    const result = await mcpToolCall(accessToken, "list_kudos", {});
    const data = parseToolResult(result.result);
    const entries = data.kudos as Record<string, unknown>[];
    const k = entries.find((k) => k.id === entryId);
    expect(k).toBeDefined();
    expect(k!.message).toBe("Great job on the release!");
    expect(k!.postedAt).toBeTruthy();
    expect(k!.slackPermalink).toBe("https://slack.test/kudos1");
    expect(k!.postedBy).toBeDefined();
    const poster = k!.postedBy as { id: string; displayName: string };
    expect(poster.id).toBe(userId);
    expect(poster.displayName).toBeTruthy();
  });

  test("list_kudos postedBy filter works", async () => {
    const result = await mcpToolCall(accessToken, "list_kudos", { postedBy: userId });
    const data = parseToolResult(result.result);
    const found = (data.kudos as { id: string }[]).find((k) => k.id === entryId);
    expect(found).toBeDefined();
  });

  test("list_kudos postedBy filter with non-matching user excludes entry", async () => {
    const result = await mcpToolCall(accessToken, "list_kudos", { postedBy: otherId });
    const data = parseToolResult(result.result);
    const found = (data.kudos as { id: string }[]).find((k) => k.id === entryId);
    expect(found).toBeUndefined();
  });

  test("list_kudos user filter returns kudos mentioning that user", async () => {
    const result = await mcpToolCall(accessToken, "list_kudos", { user: otherId });
    const data = parseToolResult(result.result);
    const found = (data.kudos as { id: string }[]).find((k) => k.id === entryId);
    expect(found).toBeDefined();
  });

  test("list_kudos period filter includes entry in range", async () => {
    const result = await mcpToolCall(accessToken, "list_kudos", {
      periodStart: "2026-04-01T00:00:00Z",
      periodEnd: "2026-05-01T00:00:00Z",
    });
    const data = parseToolResult(result.result);
    const found = (data.kudos as { id: string }[]).find((k) => k.id === entryId);
    expect(found).toBeDefined();
  });

  test("list_kudos period filter excludes entry outside range", async () => {
    const result = await mcpToolCall(accessToken, "list_kudos", {
      periodStart: "2026-05-01T00:00:00Z",
      periodEnd: "2026-06-01T00:00:00Z",
    });
    const data = parseToolResult(result.result);
    const found = (data.kudos as { id: string }[]).find((k) => k.id === entryId);
    expect(found).toBeUndefined();
  });

  test("list_kudos rejects invalid periodEnd", async () => {
    const result = await mcpToolCall(accessToken, "list_kudos", {
      periodEnd: "not-valid",
    });
    const data = parseToolResult(result.result);
    expect(data.error).toBeDefined();
    expect((data.error as { code: string }).code).toBe("validation_error");
  });

  test("list_kudos pagination works", async () => {
    // Filter to just our seeded user to guarantee exactly 2 kudos entries
    const result = await mcpToolCall(accessToken, "list_kudos", {
      postedBy: userId,
      pageSize: 1,
    });
    const data = parseToolResult(result.result);
    expect((data.kudos as unknown[]).length).toBe(1);
    expect(data.totalSize as number).toBeGreaterThanOrEqual(2);
    expect(data.nextPageToken).toBeTruthy();

    const page2 = await mcpToolCall(accessToken, "list_kudos", {
      postedBy: userId,
      pageSize: 1,
      pageToken: data.nextPageToken as string,
    });
    const page2Data = parseToolResult(page2.result);
    expect((page2Data.kudos as { id: string }[])[0].id).not.toBe(
      (data.kudos as { id: string }[])[0].id,
    );
  });
});

// ---------------------------------------------------------------------------
// Admin tool behavior: deactivate_user, channel management
// ---------------------------------------------------------------------------

test.describe("MCP admin tool behavior", () => {
  const NIL_UUID = "00000000-0000-0000-0000-000000000000";

  let adminToken: string;
  let adminId: string;
  let targetUserId: string;

  test.beforeAll(async () => {
    // Use a dedicated admin user to avoid rate-limit contention with other test groups
    const admin = await ensureUser("UMCPADMINBHV", {
      email: "mcp-admin-bhv@test.local",
      displayName: "MCP Admin Behavior",
    });
    adminId = admin.id as string;
    await query("UPDATE users SET role = 'admin' WHERE id = $1", [adminId]);
    adminToken = await createMcpAccessToken(adminId);

    // Create a user to deactivate
    const target = await ensureUser("UMCPDEACT01", {
      email: "mcp-deactivate@test.local",
      displayName: "MCP Deactivate Target",
    });
    targetUserId = target.id as string;
    // Reset deactivated state in case of previous test run
    await query("UPDATE users SET deactivated_at = NULL WHERE id = $1", [targetUserId]);
  });

  test.afterAll(async () => {
    await query("UPDATE users SET role = 'user' WHERE id = $1", [adminId]);
    await query("UPDATE users SET deactivated_at = NULL WHERE id = $1", [targetUserId]);
  });

  // -- deactivate_user --

  test("deactivate_user succeeds", async () => {
    const result = await mcpToolCall(adminToken, "deactivate_user", { userId: targetUserId });
    const data = parseToolResult(result.result);
    expect(data.id).toBe(targetUserId);
    expect(data.displayName).toBe("MCP Deactivate Target");
    expect(data.deactivatedAt).toBeTruthy();
  });

  test("deactivate_user is idempotent", async () => {
    const result = await mcpToolCall(adminToken, "deactivate_user", { userId: targetUserId });
    const data = parseToolResult(result.result);
    expect(data.id).toBe(targetUserId);
    expect(data.deactivatedAt).toBeTruthy();
  });

  test("deactivate_user rejects self-deactivation", async () => {
    const result = await mcpToolCall(adminToken, "deactivate_user", { userId: adminId });
    const data = parseToolResult(result.result);
    expect(data.error).toBeDefined();
    expect((data.error as { code: string }).code).toBe("validation_error");
  });

  test("deactivate_user returns not_found for non-existent user", async () => {
    const result = await mcpToolCall(adminToken, "deactivate_user", { userId: NIL_UUID });
    const data = parseToolResult(result.result);
    expect(data.error).toBeDefined();
    expect((data.error as { code: string }).code).toBe("not_found");
  });

  test("deactivate_user returns forbidden for non-admin", async () => {
    const other = await ensureUser("UMCPADMIN02", {
      email: "mcp-nonadmin@test.local",
      displayName: "MCP Non-Admin",
    });
    await query("UPDATE users SET role = 'user' WHERE id = $1", [other.id as string]);
    const userToken = await createMcpAccessToken(other.id as string);

    const result = await mcpToolCall(userToken, "deactivate_user", { userId: targetUserId });
    const data = parseToolResult(result.result);
    expect(data.error).toBeDefined();
    expect((data.error as { code: string }).code).toBe("forbidden");
  });

  // -- list_users query search --

  test("list_users query filter searches by display name", async () => {
    const result = await mcpToolCall(adminToken, "list_users", { query: "MCP Deactivate" });
    const data = parseToolResult(result.result);
    expect(data.totalSize as number).toBeGreaterThanOrEqual(1);
    const users = data.users as { id: string; displayName: string }[];
    const found = users.find((u) => u.id === targetUserId);
    expect(found).toBeDefined();
  });

  test("list_users query filter searches by email", async () => {
    const result = await mcpToolCall(adminToken, "list_users", { query: "mcp-deactivate@test" });
    const data = parseToolResult(result.result);
    const users = data.users as { id: string }[];
    const found = users.find((u) => u.id === targetUserId);
    expect(found).toBeDefined();
  });

  test("list_users query filter with no match returns empty", async () => {
    const result = await mcpToolCall(adminToken, "list_users", {
      query: "nonexistent_user_xyzzy_12345",
    });
    const data = parseToolResult(result.result);
    expect(data.totalSize).toBe(0);
    expect((data.users as unknown[]).length).toBe(0);
  });

  // -- snippet channel management --

  test("add_snippet_channel succeeds", async () => {
    const result = await mcpToolCall(adminToken, "add_snippet_channel", {
      slackChannelId: "CMCPSNIPTEST",
    });
    const data = parseToolResult(result.result);
    expect(data.id).toBeTruthy();
    expect(data.slackChannelId).toBe("CMCPSNIPTEST");
    expect(data.createdAt).toBeTruthy();
  });

  test("add_snippet_channel is idempotent", async () => {
    const result = await mcpToolCall(adminToken, "add_snippet_channel", {
      slackChannelId: "CMCPSNIPTEST",
    });
    const data = parseToolResult(result.result);
    expect(data.slackChannelId).toBe("CMCPSNIPTEST");
  });

  test("list_snippet_channels includes added channel", async () => {
    const result = await mcpToolCall(adminToken, "list_snippet_channels", {});
    const data = parseToolResult(result.result);
    const channels = data.snippetChannels as { slackChannelId: string }[];
    const found = channels.find((c) => c.slackChannelId === "CMCPSNIPTEST");
    expect(found).toBeDefined();
  });

  test("remove_snippet_channel succeeds", async () => {
    // Find the channel ID first
    const listResult = await mcpToolCall(adminToken, "list_snippet_channels", {});
    const listData = parseToolResult(listResult.result);
    const channel = (listData.snippetChannels as { id: string; slackChannelId: string }[]).find(
      (c) => c.slackChannelId === "CMCPSNIPTEST",
    );
    expect(channel).toBeDefined();

    const result = await mcpToolCall(adminToken, "remove_snippet_channel", {
      channelId: channel!.id,
    });
    const data = parseToolResult(result.result);
    expect(data.success).toBe(true);
  });

  test("remove_snippet_channel returns not_found for non-existent channel", async () => {
    const result = await mcpToolCall(adminToken, "remove_snippet_channel", {
      channelId: NIL_UUID,
    });
    const data = parseToolResult(result.result);
    expect(data.error).toBeDefined();
    expect((data.error as { code: string }).code).toBe("not_found");
  });

  // -- kudos channel management --

  test("add_kudos_channel succeeds", async () => {
    const result = await mcpToolCall(adminToken, "add_kudos_channel", {
      slackChannelId: "CMCPKUDOTEST",
    });
    const data = parseToolResult(result.result);
    expect(data.id).toBeTruthy();
    expect(data.slackChannelId).toBe("CMCPKUDOTEST");
    expect(data.createdAt).toBeTruthy();
  });

  test("add_kudos_channel is idempotent", async () => {
    const result = await mcpToolCall(adminToken, "add_kudos_channel", {
      slackChannelId: "CMCPKUDOTEST",
    });
    const data = parseToolResult(result.result);
    expect(data.slackChannelId).toBe("CMCPKUDOTEST");
  });

  test("list_kudos_channels includes added channel", async () => {
    const result = await mcpToolCall(adminToken, "list_kudos_channels", {});
    const data = parseToolResult(result.result);
    const channels = data.kudosChannels as { slackChannelId: string }[];
    const found = channels.find((c) => c.slackChannelId === "CMCPKUDOTEST");
    expect(found).toBeDefined();
  });

  test("remove_kudos_channel succeeds", async () => {
    const listResult = await mcpToolCall(adminToken, "list_kudos_channels", {});
    const listData = parseToolResult(listResult.result);
    const channel = (listData.kudosChannels as { id: string; slackChannelId: string }[]).find(
      (c) => c.slackChannelId === "CMCPKUDOTEST",
    );
    expect(channel).toBeDefined();

    const result = await mcpToolCall(adminToken, "remove_kudos_channel", {
      channelId: channel!.id,
    });
    const data = parseToolResult(result.result);
    expect(data.success).toBe(true);
  });

  test("remove_kudos_channel returns not_found for non-existent channel", async () => {
    const result = await mcpToolCall(adminToken, "remove_kudos_channel", {
      channelId: NIL_UUID,
    });
    const data = parseToolResult(result.result);
    expect(data.error).toBeDefined();
    expect((data.error as { code: string }).code).toBe("not_found");
  });

  // -- admin tools forbidden for non-admin --

  test("add_snippet_channel returns forbidden for non-admin", async () => {
    const other = await ensureUser("UMCPADMIN03", {
      email: "mcp-nonadmin3@test.local",
      displayName: "MCP Non-Admin 3",
    });
    await query("UPDATE users SET role = 'user' WHERE id = $1", [other.id as string]);
    const userToken = await createMcpAccessToken(other.id as string);

    const result = await mcpToolCall(userToken, "add_snippet_channel", {
      slackChannelId: "CFORBIDDEN",
    });
    const data = parseToolResult(result.result);
    expect(data.error).toBeDefined();
    expect((data.error as { code: string }).code).toBe("forbidden");
  });
});
