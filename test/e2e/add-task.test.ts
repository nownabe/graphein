import { test, expect } from "./fixtures";
import { env } from "./helpers/env";
import {
  postMessage,
  deleteMessage,
  getPermalink,
  getThreadReplies,
  waitFor,
} from "./helpers/slack";
import { submitAddTaskModal } from "./helpers/slack-interaction";
import { findUserBySlackId, deleteTaskBySlackMessage } from "./helpers/db";

test.describe("Add Task shortcut", () => {
  let slackMessageTs: string | undefined;
  const channelId = env.slackChannelId;

  test.afterEach(async () => {
    if (slackMessageTs) {
      await deleteTaskBySlackMessage(channelId, slackMessageTs);
      try {
        await deleteMessage(channelId, slackMessageTs);
      } catch {
        // Message may already be deleted
      }
    }
    slackMessageTs = undefined;
  });

  test("task created via shortcut appears in UI", async ({ authedPage }) => {
    // 1. Post a test message to Slack via API
    const testText = `E2E Add Task test ${Date.now()}`;
    const posted = await postMessage(channelId, testText);
    slackMessageTs = posted.ts;

    // 2. Get permalink and look up test user
    const permalink = await getPermalink(channelId, slackMessageTs);
    const user = await findUserBySlackId(env.slackUserId);
    expect(user).toBeDefined();
    const userId = user!.id as string;

    // 3. Simulate Slack modal submission by sending a signed view_submission request
    const taskTitle = `E2E Task: ${testText}`;
    const res = await submitAddTaskModal({
      channelId,
      messageTs: slackMessageTs,
      messageText: testText,
      permalink,
      createdById: userId,
      title: taskTitle,
      slackUserId: env.slackUserId,
    });
    expect(res.status).toBe(200);

    // 4. Verify a confirmation reply was posted in the Slack thread
    await waitFor(async () => {
      const replies = await getThreadReplies(channelId, slackMessageTs!);
      return replies.length > 0;
    });

    const replies = await getThreadReplies(channelId, slackMessageTs!);
    expect(replies.length).toBeGreaterThan(0);

    // 5. Verify the task appears in the Graphein UI
    await authedPage.goto("/tasks");

    // Task title should be visible
    const taskElement = authedPage.locator(`text=${taskTitle}`);
    await expect(taskElement).toBeVisible();

    // Slack permalink should be present as a link
    const taskCard = taskElement.locator("xpath=ancestor::div[starts-with(@id, 'task-')]");
    const slackLink = taskCard.locator('a[href="' + permalink + '"]');
    await expect(slackLink).toBeVisible();
  });
});
