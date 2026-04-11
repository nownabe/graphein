import { App } from "@slack/bolt";
import { env } from "../env";
import { HonoReceiver } from "./receiver";
import {
  createSlackLabelResolver,
  hydrateMentionLabels,
  resolveMentions,
} from "./helpers";
import { blocksToMrkdwn } from "./rich-text";
import { findOrCreateMember } from "../members/service";
import { createTask } from "../tasks/service";
import { generateTaskDetails } from "../llm/gemini";

export const receiver = env.SLACK_SOCKET_MODE ? undefined : new HonoReceiver();

export const boltApp = new App({
  token: env.SLACK_BOT_TOKEN,
  signingSecret: env.SLACK_SIGNING_SECRET,
  ...(env.SLACK_SOCKET_MODE
    ? { socketMode: true, appToken: env.SLACK_APP_TOKEN }
    : { receiver: receiver! }),
});

// Message shortcut: create_task
boltApp.shortcut("create_task", async ({ shortcut, ack, client }) => {
  await ack();

  if (shortcut.type !== "message_action") return;

  // Prefer the structured `blocks` data so bold/italic/strike/lists/quotes
  // survive; fall back to plain `text` for legacy messages.
  const messageText =
    blocksToMrkdwn((shortcut.message as { blocks?: unknown }).blocks) ??
    shortcut.message.text ??
    "";
  const channelId = shortcut.channel.id;
  const messageTs = shortcut.message_ts;
  const triggerId = shortcut.trigger_id;

  // Open loading modal immediately to avoid trigger_id expiration (3s limit)
  let viewId: string | undefined;
  try {
    const loadingRes = await client.views.open({
      trigger_id: triggerId,
      view: {
        type: "modal",
        callback_id: "create_task_modal_loading",
        title: { type: "plain_text", text: "タスク作成" },
        close: { type: "plain_text", text: "キャンセル" },
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: "タスクを準備中です..." },
          },
        ],
      },
    });
    viewId = loadingRes.view?.id;
  } catch (err) {
    console.error("Error opening loading modal:", err);
    return;
  }

  try {
    // Get permalink
    const permalinkRes = await client.chat.getPermalink({
      channel: channelId,
      message_ts: messageTs,
    });

    // Resolve mentions to members
    const mentions = await resolveMentions(client, messageText);
    const assigneeIds: string[] = [];

    for (const mention of mentions) {
      const member = await findOrCreateMember({
        slackUserId: mention.slackUserId,
        email: mention.email,
        displayName: mention.displayName,
        avatarUrl: null,
      });
      assigneeIds.push(member.id);
    }

    // If no mentions, assign to the user who triggered the shortcut
    if (assigneeIds.length === 0) {
      const triggeredBy = await client.users.info({
        user: shortcut.user.id,
      });
      if (triggeredBy.user?.profile?.email) {
        const member = await findOrCreateMember({
          slackUserId: shortcut.user.id,
          email: triggeredBy.user.profile.email,
          displayName:
            triggeredBy.user.profile.display_name ||
            triggeredBy.user.profile.real_name ||
            shortcut.user.id,
          avatarUrl: triggeredBy.user.profile.image_72 ?? null,
        });
        assigneeIds.push(member.id);
      }
    }

    // Hydrate Slack entities (<@U1>, <#C1>, <!subteam^S1>) with display labels
    // so the stored description renders with names instead of raw IDs.
    const hydratedMessageText = await hydrateMentionLabels(
      messageText,
      createSlackLabelResolver(client),
    );

    // Generate title and deadline with Gemini
    const details = await generateTaskDetails(messageText);

    // Creator is the person who triggered the shortcut
    const creatorInfo = await client.users.info({ user: shortcut.user.id });
    const creator = await findOrCreateMember({
      slackUserId: shortcut.user.id,
      email: creatorInfo.user?.profile?.email ?? "",
      displayName:
        creatorInfo.user?.profile?.display_name ||
        creatorInfo.user?.profile?.real_name ||
        shortcut.user.id,
      avatarUrl: creatorInfo.user?.profile?.image_72 ?? null,
    });

    // Update modal with task details
    await client.views.update({
      view_id: viewId!,
      view: {
        type: "modal",
        callback_id: "create_task_modal",
        private_metadata: JSON.stringify({
          channelId,
          messageTs,
          messageText: hydratedMessageText,
          permalink: permalinkRes.permalink ?? "",
          createdById: creator.id,
          assigneeIds,
        }),
        title: { type: "plain_text", text: "タスク作成" },
        submit: { type: "plain_text", text: "作成" },
        close: { type: "plain_text", text: "キャンセル" },
        blocks: [
          {
            type: "input",
            block_id: "title_block",
            label: { type: "plain_text", text: "タイトル" },
            element: {
              type: "plain_text_input",
              action_id: "title",
              initial_value: details.title,
            },
          },
          {
            type: "input",
            block_id: "deadline_block",
            optional: true,
            label: { type: "plain_text", text: "期限" },
            element: {
              type: "datetimepicker",
              action_id: "deadline",
              ...(details.deadline
                ? { initial_date_time: Math.floor(new Date(details.deadline).getTime() / 1000) }
                : {}),
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*元のメッセージ:*\n>${messageText.replace(/\n/g, "\n>")}`,
            },
          },
        ],
      },
    });
  } catch (err) {
    console.error("Error in create_task shortcut:", err);
    // Update modal to show error instead of using ephemeral (avoids not_in_channel)
    if (viewId) {
      try {
        await client.views.update({
          view_id: viewId,
          view: {
            type: "modal",
            callback_id: "create_task_modal_error",
            title: { type: "plain_text", text: "タスク作成" },
            close: { type: "plain_text", text: "閉じる" },
            blocks: [
              {
                type: "section",
                text: { type: "mrkdwn", text: "タスクの作成中にエラーが発生しました。もう一度お試しください。" },
              },
            ],
          },
        });
      } catch (updateErr) {
        console.error("Failed to update modal with error:", updateErr);
      }
    }
  }
});

// Modal submission: create_task_modal
boltApp.view("create_task_modal", async ({ ack, view, client, body }) => {
  await ack();

  const metadata = JSON.parse(view.private_metadata);
  const title =
    view.state.values.title_block.title.value ?? "Untitled task";
  const deadlineTimestamp =
    view.state.values.deadline_block.deadline.selected_date_time;

  try {
    const task = await createTask({
      title,
      description: metadata.messageText || undefined,
      deadline: deadlineTimestamp ? new Date(deadlineTimestamp * 1000) : null,
      slackMessageTs: metadata.messageTs,
      slackChannelId: metadata.channelId,
      slackPermalink: metadata.permalink,
      createdById: metadata.createdById,
      assigneeIds: metadata.assigneeIds,
    });

    // Post confirmation message
    try {
      await client.chat.postMessage({
        channel: metadata.channelId,
        thread_ts: metadata.messageTs,
        text: `タスクを作成しました: *${task.title}*\n${env.BASE_URL}/tasks/${task.id}`,
      });
    } catch {
      // Non-critical: confirmation message failed
    }
  } catch (err) {
    console.error("Error creating task from modal:", err);
    try {
      await client.chat.postEphemeral({
        channel: metadata.channelId,
        user: body.user.id,
        text: "タスクの作成中にエラーが発生しました。もう一度お試しください。",
      });
    } catch (ephemeralErr) {
      console.error("Failed to send ephemeral error message:", ephemeralErr);
    }
  }
});
