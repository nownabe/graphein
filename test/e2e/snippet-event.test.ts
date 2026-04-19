import { test, expect } from "./fixtures";
import { env } from "./helpers/env";
import { postMessage, deleteMessage, waitFor, getReactions } from "./helpers/slack";
import { sendSlackMessageEvent } from "./helpers/slack-interaction";
import {
  findSnippetBySlackMessage,
  deleteSnippetBySlackMessage,
  ensureSnippetChannel,
} from "./helpers/db";

test.describe("Snippet event listener", () => {
  let slackMessageTs: string | undefined;
  const channelId = env.snippetChannelId;

  test.beforeAll(async () => {
    // Ensure the snippet channel is registered in the DB so the event handler processes it
    await ensureSnippetChannel(channelId);
  });

  test.afterEach(async () => {
    if (slackMessageTs) {
      await deleteSnippetBySlackMessage(channelId, slackMessageTs);
      try {
        await deleteMessage(channelId, slackMessageTs);
      } catch {
        // Message may already be deleted
      }
    }
    slackMessageTs = undefined;
  });

  test("snippet created via message event appears in UI", async ({ authedPage }) => {
    // 1. Post a test message with a user mention to the snippet-monitored channel
    const uniqueTag = `E2E Snippet event test ${Date.now()}`;
    const testText = `${uniqueTag} <@${env.slackUserId}>`;
    const posted = await postMessage(channelId, testText);
    slackMessageTs = posted.ts;

    // Clean up any snippet that may have been created by a prior automatic event delivery
    // (in case the server is running in Socket Mode or received the real event).
    await deleteSnippetBySlackMessage(channelId, slackMessageTs);

    // 2. Simulate the Slack message event by sending a signed event to /slack/events
    const res = await sendSlackMessageEvent({
      channelId,
      messageTs: slackMessageTs,
      messageText: testText,
      slackUserId: env.slackUserId,
    });
    expect(res.status).toBe(200);

    // 3. Wait for the snippet to appear in the database
    await waitFor(
      async () => {
        const snippet = await findSnippetBySlackMessage(channelId, slackMessageTs!);
        return !!snippet;
      },
      { timeout: 15_000, interval: 1_000 },
    );

    const snippet = await findSnippetBySlackMessage(channelId, slackMessageTs!);
    expect(snippet).toBeDefined();

    // 4. Verify a :memo: reaction was added to the Slack message
    await waitFor(async () => {
      const reactions = await getReactions(channelId, slackMessageTs!);
      return reactions.some((r) => r.name === "memo");
    });
    const reactions = await getReactions(channelId, slackMessageTs!);
    expect(reactions.some((r) => r.name === "memo")).toBe(true);

    // 5. Verify the snippet appears in the Graphein UI
    const today = new Date().toISOString().split("T")[0];
    await authedPage.goto(`/snippets?period=day&date=${today}&user=&usergroup=&postedBy=`);

    const snippetElement = authedPage.locator(`text=${uniqueTag}`);
    await expect(snippetElement).toBeVisible({ timeout: 10_000 });
  });
});
