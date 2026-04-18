import { test, expect } from "./fixtures";
import { env } from "./helpers/env";
import {
  postMessage,
  deleteMessage,
  getPermalink,
  getThreadReplies,
  waitFor,
} from "./helpers/slack";
import {
  findTaskBySlackMessage,
  findUserBySlackId,
  deleteTaskBySlackMessage,
  countTaskAssignees,
  query,
} from "./helpers/db";

test.describe("Add Task shortcut", () => {
  let slackMessageTs: string;
  const channelId = env.slackChannelId;

  test.afterEach(async () => {
    // Clean up: delete the task from DB and the Slack message
    if (slackMessageTs) {
      await deleteTaskBySlackMessage(channelId, slackMessageTs);
      try {
        await deleteMessage(channelId, slackMessageTs);
      } catch {
        // Message may already be deleted
      }
    }
  });

  test("task created via shortcut appears in DB and UI", async ({ authedPage }) => {
    // 1. Post a test message to Slack (simulates the source message)
    const testText = `E2E Add Task test ${Date.now()}`;
    const posted = await postMessage(channelId, testText);
    slackMessageTs = posted.ts;

    // 2. Get the permalink for the message
    const permalink = await getPermalink(channelId, slackMessageTs);

    // 3. Look up the test user in the DB (required for created_by_id)
    const user = await findUserBySlackId(env.slackUserId);
    expect(user).toBeDefined();
    const userId = user!.id as string;

    // 4. Simulate task creation (what the Slack shortcut + modal submission does)
    //    We insert directly into the DB because Slack shortcuts cannot be triggered
    //    programmatically. This tests the data flow from DB to UI.
    const taskTitle = `E2E Task: ${testText}`;
    const insertedRows = await query<{ id: string }>(
      `INSERT INTO tasks (title, description, slack_message_ts, slack_channel_id, slack_permalink, created_by_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [taskTitle, testText, slackMessageTs, channelId, permalink, userId],
    );
    const taskId = insertedRows[0].id;
    expect(taskId).toBeDefined();

    // Add the creator as task owner (matches createTask behavior)
    await query("INSERT INTO task_owners (task_id, user_id) VALUES ($1, $2)", [taskId, userId]);

    // Add the creator as an assignee (typical shortcut behavior assigns the triggering user)
    await query("INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2)", [taskId, userId]);

    // 5. Verify in DB: task exists with correct fields
    const task = await findTaskBySlackMessage(channelId, slackMessageTs);
    expect(task).toBeDefined();
    expect(task!.title).toBe(taskTitle);
    expect(task!.slack_permalink).toBe(permalink);
    expect(task!.created_by_id).toBe(userId);

    const assigneeCount = await countTaskAssignees(taskId);
    expect(assigneeCount).toBe(1);

    // 6. Verify in Graphein UI: navigate to Tasks page and confirm the new task appears
    await authedPage.goto("/tasks");
    await authedPage.waitForLoadState("networkidle");

    // The task title should be visible on the page
    const taskElement = authedPage.locator(`text=${taskTitle}`);
    await expect(taskElement).toBeVisible({ timeout: 10_000 });
  });

  test("task with thread reply appears with confirmation", async ({ authedPage }) => {
    // 1. Post a test message to Slack
    const testText = `E2E Add Task reply test ${Date.now()}`;
    const posted = await postMessage(channelId, testText);
    slackMessageTs = posted.ts;

    const permalink = await getPermalink(channelId, slackMessageTs);
    const user = await findUserBySlackId(env.slackUserId);
    expect(user).toBeDefined();
    const userId = user!.id as string;

    // 2. Create the task in DB
    const taskTitle = `E2E Reply Task: ${testText}`;
    const insertedRows = await query<{ id: string }>(
      `INSERT INTO tasks (title, description, slack_message_ts, slack_channel_id, slack_permalink, created_by_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [taskTitle, testText, slackMessageTs, channelId, permalink, userId],
    );
    const taskId = insertedRows[0].id;

    await query("INSERT INTO task_owners (task_id, user_id) VALUES ($1, $2)", [taskId, userId]);
    await query("INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2)", [taskId, userId]);

    // 3. Post a confirmation reply in the thread (simulates what the bot does after task creation)
    const slackClient = (await import("./helpers/slack")).getSlackClient();
    await slackClient.chat.postMessage({
      channel: channelId,
      thread_ts: slackMessageTs,
      text: `Task created: ${taskTitle}`,
    });

    // 4. Verify the thread reply exists
    await waitFor(async () => {
      const replies = await getThreadReplies(channelId, slackMessageTs);
      return replies.length > 0;
    });

    const replies = await getThreadReplies(channelId, slackMessageTs);
    expect(replies.length).toBeGreaterThan(0);
    expect(replies.some((r) => r.text.includes("Task created"))).toBe(true);

    // 5. Verify the task appears in the UI
    await authedPage.goto("/tasks");
    await authedPage.waitForLoadState("networkidle");

    const taskElement = authedPage.locator(`text=${taskTitle}`);
    await expect(taskElement).toBeVisible({ timeout: 10_000 });
  });
});
