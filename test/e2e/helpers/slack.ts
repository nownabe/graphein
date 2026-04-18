import { WebClient } from "@slack/web-api";
import { env } from "./env";

let _client: WebClient | undefined;

/** Get a shared Slack WebClient instance for E2E tests. */
export function getSlackClient(): WebClient {
  if (!_client) {
    _client = new WebClient(env.slackBotToken);
  }
  return _client;
}

/**
 * Post a message to a Slack channel.
 * Returns the message timestamp (ts) for later reference.
 */
export async function postMessage(
  channelId: string,
  text: string,
): Promise<{ ts: string; channelId: string }> {
  const client = getSlackClient();
  const result = await client.chat.postMessage({ channel: channelId, text });
  if (!result.ts) {
    throw new Error("Failed to post Slack message: no ts returned");
  }
  return { ts: result.ts, channelId };
}

/**
 * Delete a Slack message. Use in test cleanup to avoid polluting channels.
 */
export async function deleteMessage(channelId: string, ts: string): Promise<void> {
  const client = getSlackClient();
  await client.chat.delete({ channel: channelId, ts });
}

/**
 * Get reactions on a message. Useful to verify the bot reacted (e.g. :memo:, :tada:).
 */
export async function getReactions(
  channelId: string,
  ts: string,
): Promise<{ name: string; count: number }[]> {
  const client = getSlackClient();
  const result = await client.reactions.get({ channel: channelId, timestamp: ts, full: true });
  return (result.message?.reactions ?? []).map((r) => ({
    name: r.name ?? "",
    count: r.count ?? 0,
  }));
}

/**
 * Get thread replies for a message. Useful to verify the bot posted a confirmation reply.
 */
export async function getThreadReplies(
  channelId: string,
  ts: string,
): Promise<{ text: string; user: string; ts: string }[]> {
  const client = getSlackClient();
  const result = await client.conversations.replies({ channel: channelId, ts });
  // The first message in replies is the parent; skip it
  return (result.messages ?? [])
    .filter((m) => m.ts !== ts)
    .map((m) => ({
      text: m.text ?? "",
      user: m.user ?? "",
      ts: m.ts ?? "",
    }));
}

/**
 * Get a permalink for a Slack message.
 */
export async function getPermalink(channelId: string, ts: string): Promise<string> {
  const client = getSlackClient();
  const result = await client.chat.getPermalink({ channel: channelId, message_ts: ts });
  return result.permalink ?? "";
}

/**
 * Wait for a condition to become true, polling at an interval.
 * Useful for waiting for async event processing (e.g. message event → snippet created).
 */
export async function waitFor(
  fn: () => Promise<boolean>,
  { timeout = 15_000, interval = 1_000 } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`waitFor timed out after ${timeout}ms`);
}
