import { test, expect } from "./fixtures";
import { env } from "./helpers/env";
import { postMessage, deleteMessage, waitFor, getReactions } from "./helpers/slack";
import { submitAddSnippetModal } from "./helpers/slack-interaction";
import {
  findSnippetBySlackMessage,
  deleteSnippetBySlackMessage,
  findUserBySlackId,
} from "./helpers/db";

test.describe("Add Snippet shortcut", () => {
  let slackMessageTs: string | undefined;
  const channelId = env.snippetChannelId;

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

  test("snippet created via shortcut appears in UI", async ({ authedPage }) => {
    // 1. Post a test message with a user mention to the snippet-monitored channel
    const uniqueTag = `E2E Snippet test ${Date.now()}`;
    const testText = `${uniqueTag} <@${env.slackUserId}>`;
    const posted = await postMessage(channelId, testText);
    slackMessageTs = posted.ts;

    // Wait briefly to avoid race with the automatic message event handler,
    // then clean up any snippet it may have created so our shortcut test starts fresh.
    await waitFor(
      async () => {
        const existing = await findSnippetBySlackMessage(channelId, slackMessageTs!);
        return !!existing;
      },
      { timeout: 10_000, interval: 1_000 },
    ).catch(() => {
      // The automatic handler may not fire in HTTP mode; that's fine.
    });
    await deleteSnippetBySlackMessage(channelId, slackMessageTs);

    // 2. Look up test user in DB
    const user = await findUserBySlackId(env.slackUserId);
    expect(user).toBeDefined();

    // 3. Simulate the Add Snippet modal submission
    const res = await submitAddSnippetModal({
      channelId,
      messageTs: slackMessageTs,
      messageText: testText,
      authorSlackId: env.slackUserId,
      slackUserId: env.slackUserId,
    });
    expect(res.status).toBe(200);

    // 4. Verify a :memo: reaction was added to the Slack message
    await waitFor(async () => {
      const reactions = await getReactions(channelId, slackMessageTs!);
      return reactions.some((r) => r.name === "memo");
    });
    const reactions = await getReactions(channelId, slackMessageTs!);
    expect(reactions.some((r) => r.name === "memo")).toBe(true);

    // 5. Verify the snippet appears in the Graphein UI
    //    Pass today's date explicitly since the default view shows the previous period
    const today = new Date().toISOString().split("T")[0];
    await authedPage.goto(`/snippets?period=day&date=${today}&user=&usergroup=&postedBy=`);

    // The snippet content (which includes the unique tag) should be visible
    const snippetElement = authedPage.locator(`text=${uniqueTag}`);
    await expect(snippetElement).toBeVisible({ timeout: 10_000 });
  });
});
