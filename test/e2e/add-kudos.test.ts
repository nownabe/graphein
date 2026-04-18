import { test, expect } from "./fixtures";
import { env } from "./helpers/env";
import { postMessage, deleteMessage, waitFor, getReactions } from "./helpers/slack";
import { submitAddKudosModal } from "./helpers/slack-interaction";
import {
  findKudosBySlackMessage,
  deleteKudosBySlackMessage,
  findUserBySlackId,
} from "./helpers/db";

test.describe("Add Kudos shortcut", () => {
  let slackMessageTs: string | undefined;
  const channelId = env.kudosChannelId;

  test.afterEach(async () => {
    if (slackMessageTs) {
      await deleteKudosBySlackMessage(channelId, slackMessageTs);
      try {
        await deleteMessage(channelId, slackMessageTs);
      } catch {
        // Message may already be deleted
      }
    }
    slackMessageTs = undefined;
  });

  test("kudos created via shortcut appears in UI", async ({ authedPage }) => {
    // 1. Post a test message with a user mention to the kudos-configured channel.
    //    The message format must start with a mention so the kudos parser recognises it.
    const uniqueTag = `E2E Kudos test ${Date.now()}`;
    const testText = `<@${env.slackUserId}> ${uniqueTag}`;
    const posted = await postMessage(channelId, testText);
    slackMessageTs = posted.ts;

    // Wait briefly and clean up any kudos the automatic message event handler may have created,
    // so our shortcut test starts from a clean state.
    await waitFor(
      async () => {
        const existing = await findKudosBySlackMessage(channelId, slackMessageTs!);
        return !!existing;
      },
      { timeout: 10_000, interval: 1_000 },
    ).catch(() => {
      // The automatic handler may not fire in HTTP mode; that's fine.
    });
    await deleteKudosBySlackMessage(channelId, slackMessageTs);

    // 2. Look up the test user in the DB
    const user = await findUserBySlackId(env.slackUserId);
    expect(user).toBeDefined();

    // 3. Simulate the Add Kudos modal submission
    const res = await submitAddKudosModal({
      channelId,
      messageTs: slackMessageTs,
      messageText: testText,
      authorSlackId: env.slackUserId,
      slackUserId: env.slackUserId,
    });
    expect(res.status).toBe(200);

    // 4. Verify a :tada: reaction was added to the Slack message
    await waitFor(async () => {
      const reactions = await getReactions(channelId, slackMessageTs!);
      return reactions.some((r) => r.name === "tada");
    });
    const reactions = await getReactions(channelId, slackMessageTs!);
    expect(reactions.some((r) => r.name === "tada")).toBe(true);

    // 5. Verify the kudos appears in the Graphein UI.
    //    Navigate to the Kudos page with today's date to ensure the new entry is visible.
    const today = new Date().toISOString().split("T")[0];
    await authedPage.goto(`/kudos?period=day&date=${today}&user=&postedBy=`);

    // The kudos message content (which includes the unique tag) should be visible
    const kudosElement = authedPage.locator(`text=${uniqueTag}`);
    await expect(kudosElement).toBeVisible({ timeout: 10_000 });
  });
});
