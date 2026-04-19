import postgres from "postgres";
import { env } from "./env";

let _sql: ReturnType<typeof postgres> | undefined;

/** Get a shared postgres client for E2E tests. */
function getSql() {
  if (!_sql) {
    _sql = postgres(env.databaseUrl);
  }
  return _sql;
}

/** Execute a SQL query and return rows. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = getSql();
  const rows = await client.unsafe(sql, params as never[]);
  return rows as unknown as T[];
}

/** Close the database connection. Call in test teardown if needed. */
export async function closeDb(): Promise<void> {
  if (_sql) {
    await _sql.end();
    _sql = undefined;
  }
}

/** Find tasks by Slack message reference. */
export async function findTaskBySlackMessage(
  channelId: string,
  messageTs: string,
): Promise<Record<string, unknown> | undefined> {
  const rows = await query(
    "SELECT * FROM tasks WHERE slack_channel_id = $1 AND slack_message_ts = $2 LIMIT 1",
    [channelId, messageTs],
  );
  return rows[0];
}

/** Find a snippet by Slack message reference. */
export async function findSnippetBySlackMessage(
  channelId: string,
  messageTs: string,
): Promise<Record<string, unknown> | undefined> {
  const rows = await query(
    "SELECT * FROM snippets WHERE slack_channel_id = $1 AND slack_message_ts = $2 LIMIT 1",
    [channelId, messageTs],
  );
  return rows[0];
}

/** Find kudos by Slack message reference. */
export async function findKudosBySlackMessage(
  channelId: string,
  messageTs: string,
): Promise<Record<string, unknown> | undefined> {
  const rows = await query(
    "SELECT * FROM kudos WHERE slack_channel_id = $1 AND slack_message_ts = $2 LIMIT 1",
    [channelId, messageTs],
  );
  return rows[0];
}

/** Find a user by Slack user ID. */
export async function findUserBySlackId(
  slackUserId: string,
): Promise<Record<string, unknown> | undefined> {
  const rows = await query("SELECT * FROM users WHERE slack_user_id = $1 LIMIT 1", [slackUserId]);
  return rows[0];
}

/** Count task assignees for a task. */
export async function countTaskAssignees(taskId: string): Promise<number> {
  const rows = await query<{ count: string }>(
    "SELECT count(*)::text as count FROM task_assignees WHERE task_id = $1",
    [taskId],
  );
  return Number.parseInt(rows[0]?.count ?? "0", 10);
}

/** Get kudos entries for a kudos record. */
export async function findKudosEntries(kudosId: string): Promise<Record<string, unknown>[]> {
  return query("SELECT * FROM kudos_entries WHERE kudos_id = $1", [kudosId]);
}

/** Delete a task and its associations by Slack message reference (test cleanup). */
export async function deleteTaskBySlackMessage(
  channelId: string,
  messageTs: string,
): Promise<void> {
  await query("DELETE FROM tasks WHERE slack_channel_id = $1 AND slack_message_ts = $2", [
    channelId,
    messageTs,
  ]);
}

/** Delete a snippet by Slack message reference (test cleanup). */
export async function deleteSnippetBySlackMessage(
  channelId: string,
  messageTs: string,
): Promise<void> {
  await query("DELETE FROM snippets WHERE slack_channel_id = $1 AND slack_message_ts = $2", [
    channelId,
    messageTs,
  ]);
}

/** Ensure a user exists in the DB, creating one if needed. Returns the user row. */
export async function ensureUser(
  slackUserId: string,
  defaults: { email: string; displayName: string },
): Promise<Record<string, unknown>> {
  const existing = await findUserBySlackId(slackUserId);
  if (existing) return existing;

  const rows = await query(
    `INSERT INTO users (slack_user_id, email, display_name)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [slackUserId, defaults.email, defaults.displayName],
  );
  return rows[0];
}

/** Delete kudos by Slack message reference (test cleanup). */
export async function deleteKudosBySlackMessage(
  channelId: string,
  messageTs: string,
): Promise<void> {
  await query("DELETE FROM kudos WHERE slack_channel_id = $1 AND slack_message_ts = $2", [
    channelId,
    messageTs,
  ]);
}

/** Ensure a kudos channel is registered in the DB. Inserts if not already present. */
export async function ensureKudosChannel(slackChannelId: string): Promise<void> {
  await query(
    `INSERT INTO kudos_channels (slack_channel_id)
     VALUES ($1)
     ON CONFLICT (slack_channel_id) DO NOTHING`,
    [slackChannelId],
  );
}

/** Ensure a snippet channel is registered in the DB. Inserts if not already present. */
export async function ensureSnippetChannel(slackChannelId: string): Promise<void> {
  await query(
    `INSERT INTO snippet_channels (slack_channel_id)
     VALUES ($1)
     ON CONFLICT (slack_channel_id) DO NOTHING`,
    [slackChannelId],
  );
}
