import { test, expect } from "./fixtures";
import { env } from "./helpers/env";
import { postMessage, deleteMessage, waitFor, getReactions } from "./helpers/slack";
import { sendSlackMessageEvent } from "./helpers/slack-interaction";
import {
  findKudosBySlackMessage,
  findKudosEntries,
  deleteKudosBySlackMessage,
  ensureKudosChannel,
} from "./helpers/db";

test.describe("Kudos event listener", () => {
  let slackMessageTs: string | undefined;
  const channelId = env.kudosChannelId;

  test.beforeAll(async () => {
    // Ensure the kudos channel is registered in the DB so the event handler processes it
    await ensureKudosChannel(channelId);
  });

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

  test("kudos created via message event appears in UI", async ({ authedPage }) => {
    // 1. Post a test message with a user mention in kudos format to the kudos channel
    const uniqueTag = `E2E Kudos test ${Date.now()}`;
    const testText = `<@${env.slackUserId}> ${uniqueTag}`;
    const posted = await postMessage(channelId, testText);
    slackMessageTs = posted.ts;

    // 2. Send the message event to the Graphein server (simulates Slack Event API)
    const eventRes = await sendSlackMessageEvent({
      channelId,
      messageTs: slackMessageTs,
      messageText: testText,
      slackUserId: env.slackUserId,
    });
    expect(eventRes.status).toBe(200);

    // 3. Wait for the kudos record to appear in the database
    await waitFor(
      async () => {
        const kudos = await findKudosBySlackMessage(channelId, slackMessageTs!);
        return !!kudos;
      },
      { timeout: 15_000, interval: 1_000 },
    );

    // 4. Verify the kudos record and its entries exist in the DB
    const kudos = await findKudosBySlackMessage(channelId, slackMessageTs);
    expect(kudos).toBeDefined();

    const entries = await findKudosEntries(kudos!.id as string);
    expect(entries.length).toBeGreaterThanOrEqual(1);

    // 5. Verify a :tada: reaction was added to the Slack message
    await waitFor(async () => {
      const reactions = await getReactions(channelId, slackMessageTs!);
      return reactions.some((r) => r.name === "tada");
    });
    const reactions = await getReactions(channelId, slackMessageTs!);
    expect(reactions.some((r) => r.name === "tada")).toBe(true);

    // 6. Verify the kudos entry appears in the Graphein UI
    //    Navigate to the kudos page with today's date and no user filter
    //    so the entry is visible regardless of the default mentioned-user filter
    const today = new Date().toISOString().split("T")[0];
    await authedPage.goto(`/kudos?period=day&date=${today}&user=&postedBy=`);

    const kudosElement = authedPage.locator(`text=${uniqueTag}`);
    await expect(kudosElement).toBeVisible({ timeout: 10_000 });
  });
});
