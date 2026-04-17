import { App } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { HonoReceiver } from "./receiver";
import {
  createSlackLabelResolver,
  hydrateMentionLabels,
  extractUserMentions,
  extractUsergroupMentions,
} from "./helpers";
import { blocksToMrkdwn } from "./rich-text";
import type { UserService } from "../users/service";
import type { TaskService } from "../tasks/service";
import type { SnippetService } from "../snippets/service";
import type { KudosService } from "../kudos/service";
import { parseKudosMessage } from "../kudos/parser";
import type { GeminiClient } from "../llm/gemini";
import { t } from "../i18n";
import type { Locale } from "../i18n/messages";

export interface BoltConfig {
  slackBotToken: string;
  slackSigningSecret: string;
  slackSocketMode: boolean;
  slackAppToken: string;
  baseUrl: string;
}

export interface BoltDeps {
  userService: UserService;
  taskService: TaskService;
  snippetService: SnippetService;
  kudosService: KudosService;
  geminiClient: GeminiClient;
}

export function createBolt(config: BoltConfig, deps: BoltDeps) {
  const { userService, taskService, snippetService, kudosService, geminiClient } = deps;

  const receiver = config.slackSocketMode ? undefined : new HonoReceiver(config.slackSigningSecret);

  const boltApp = new App({
    token: config.slackBotToken,
    signingSecret: config.slackSigningSecret,
    ...(config.slackSocketMode
      ? { socketMode: true, appToken: config.slackAppToken }
      : { receiver: receiver! }),
  });

  // Build and show the create-task modal (LLM call + Slack API lookups).
  // Shared by the shortcut handler (no duplicate) and the duplicate-confirm
  // view submission handler (user chose to create anyway).
  async function showCreateTaskModal(params: {
    client: WebClient;
    viewId: string;
    messageText: string;
    channelId: string;
    messageTs: string;
    slackUserId: string;
    locale: Locale;
  }) {
    const { client, viewId, messageText, channelId, messageTs, slackUserId, locale } = params;

    // Get permalink
    const permalinkRes = await client.chat.getPermalink({
      channel: channelId,
      message_ts: messageTs,
    });

    // Extract and resolve usergroup mentions for multi_static_select
    const groupMentionIds = [
      ...new Set(
        [...messageText.matchAll(/<!subteam\^(S[A-Z0-9]+)(?:\|[^>]*)?>/g)].map((m) => m[1]),
      ),
    ];
    const resolver = createSlackLabelResolver(client);

    interface GroupCandidate {
      groupId: string;
      label: string;
      mentionToken: string;
      userIds: string[]; // pre-resolved DB user IDs
      slackUserIds: string[]; // Slack user IDs in this group
    }
    const groupCandidates: GroupCandidate[] = [];

    for (const groupId of groupMentionIds) {
      try {
        const groupHandle = await resolver.usergroup(groupId);
        const usersResult = await client.usergroups.users.list({ usergroup: groupId });
        const userIds: string[] = [];
        const slackUserIds: string[] = [];
        for (const slackUid of usersResult.users ?? []) {
          try {
            const result = await client.users.info({ user: slackUid });
            if (result.user?.profile?.email) {
              const user = await userService.findOrCreateUser({
                slackUserId: slackUid,

                email: result.user.profile.email,
                displayName:
                  result.user.profile.display_name || result.user.profile.real_name || slackUid,
                avatarUrl: result.user.profile.image_72 ?? null,
              });
              // Skip deactivated users
              if (user.deactivatedAt != null) continue;
              userIds.push(user.id);
              slackUserIds.push(slackUid);
            }
          } catch {
            // Skip unresolvable users
          }
        }
        if (userIds.length > 0) {
          groupCandidates.push({
            groupId,
            label: `@${groupHandle ?? groupId}`,
            mentionToken: `<!subteam^${groupId}>`,
            userIds,
            slackUserIds,
          });
          // Sync group membership to DB (skips if synced within TTL)
          try {
            const usergroup = await snippetService.findOrCreateUsergroup(
              groupId,
              groupHandle ?? groupId,
              groupHandle ?? undefined,
            );
            if (await snippetService.isUsergroupMembershipStale(usergroup.id)) {
              await snippetService.syncUsergroupMembers(usergroup.id, userIds);
            }
          } catch {
            // Non-critical
          }
        }
      } catch {
        // Skip unresolvable groups
      }
    }

    // Extract mentioned user IDs for multi_users_select initial value,
    // excluding users already covered by a selected group
    const groupUserIds = new Set(groupCandidates.flatMap((g) => g.slackUserIds));
    const userMentionIds = [
      ...new Set([...messageText.matchAll(/<@(U[A-Z0-9]+)>/g)].map((m) => m[1])),
    ].filter((id) => !groupUserIds.has(id));
    // Default to the triggering user if no individual mentions remain
    const initialUsers =
      userMentionIds.length > 0 || groupCandidates.length > 0 ? userMentionIds : [slackUserId];

    // Hydrate Slack entities (<@U1>, <#C1>, <!subteam^S1>) with display labels
    // so the stored description renders with names instead of raw IDs.
    const hydratedMessageText = await hydrateMentionLabels(messageText, resolver);

    // Generate title and deadline with Gemini. Use the Slack message's post
    // time as the reference for relative expressions like "tomorrow".
    const postedAt = new Date(Number(messageTs.split(".")[0]) * 1000);
    const details = await geminiClient.generateTaskDetails(messageText, postedAt);

    // Creator is the person who triggered the shortcut
    const creatorInfo = await client.users.info({ user: slackUserId });
    const creator = await userService.findOrCreateUser({
      slackUserId,
      email: creatorInfo.user?.profile?.email ?? "",
      displayName:
        creatorInfo.user?.profile?.display_name ||
        creatorInfo.user?.profile?.real_name ||
        slackUserId,
      avatarUrl: creatorInfo.user?.profile?.image_72 ?? null,
    });

    // Build users select block (native Slack user picker)
    const usersBlock = {
      type: "input" as const,
      block_id: "users_block",
      optional: true,
      label: { type: "plain_text" as const, text: t(locale, "slack.modal.assigneesLabel") },
      element: {
        type: "multi_users_select" as const,
        action_id: "users",
        ...(initialUsers.length > 0 ? { initial_users: initialUsers } : {}),
      },
    };

    // Build groups select block (only when usergroup mentions exist)
    const groupOptions = groupCandidates.map((g) => ({
      text: { type: "plain_text" as const, text: g.label },
      value: g.groupId,
    }));
    const groupsBlock =
      groupOptions.length > 0
        ? {
            type: "input" as const,
            block_id: "groups_block",
            optional: true,
            label: { type: "plain_text" as const, text: t(locale, "slack.modal.groupsLabel") },
            element: {
              type: "multi_static_select" as const,
              action_id: "groups",
              options: groupOptions,
              initial_options: groupOptions,
            },
          }
        : null;

    // Update modal with task details
    await client.views.update({
      view_id: viewId,
      view: {
        type: "modal",
        callback_id: "create_task_modal",
        private_metadata: JSON.stringify({
          channelId,
          messageTs,
          messageText: hydratedMessageText,
          permalink: permalinkRes.permalink ?? "",
          createdById: creator.id,
          groupCandidates,
          locale,
        }),
        title: { type: "plain_text", text: t(locale, "slack.modal.title") },
        submit: { type: "plain_text", text: t(locale, "slack.modal.submit") },
        close: { type: "plain_text", text: t(locale, "slack.modal.cancel") },
        blocks: [
          {
            type: "input",
            block_id: "title_block",
            label: { type: "plain_text", text: t(locale, "slack.modal.titleLabel") },
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
            label: { type: "plain_text", text: t(locale, "slack.modal.deadlineLabel") },
            element: {
              type: "datetimepicker",
              action_id: "deadline",
              ...(details.deadline
                ? { initial_date_time: Math.floor(new Date(details.deadline).getTime() / 1000) }
                : {}),
            },
          },
          usersBlock,
          ...(groupsBlock ? [groupsBlock] : []),
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*${t(locale, "slack.modal.originalMessage")}*\n>${messageText.replace(/\n/g, "\n>")}`,
            },
          },
        ],
      },
    });
  }

  // Message shortcut: create_task
  boltApp.shortcut("create_task", async ({ shortcut, ack, client }) => {
    await ack();

    if (shortcut.type !== "message_action") return;

    // Look up user's saved locale for i18n
    const existingUser = await userService.findUserBySlackUserId(shortcut.user.id);
    const locale = (existingUser?.locale ?? "en") as Locale;

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
          title: { type: "plain_text", text: t(locale, "slack.modal.title") },
          close: { type: "plain_text", text: t(locale, "slack.modal.cancel") },
          blocks: [
            {
              type: "section",
              text: { type: "mrkdwn", text: t(locale, "slack.modal.loading") },
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
      // Check if a task already exists for this message
      const existingTask = await taskService.findTaskBySlackMessage(channelId, messageTs);

      if (existingTask) {
        // Show duplicate warning modal; user can choose to create anyway
        const taskUrl = `${config.baseUrl}/tasks#task-${existingTask.id}`;
        const safeTitle = existingTask.title.replace(/[|>]/g, " ");
        await client.views.update({
          view_id: viewId!,
          view: {
            type: "modal",
            callback_id: "create_task_duplicate_confirm",
            private_metadata: JSON.stringify({
              channelId,
              messageTs,
              messageText,
              slackUserId: shortcut.user.id,
              locale,
            }),
            title: { type: "plain_text", text: t(locale, "slack.modal.title") },
            submit: {
              type: "plain_text",
              text: t(locale, "slack.modal.duplicateSubmit"),
            },
            close: { type: "plain_text", text: t(locale, "slack.modal.cancel") },
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `:warning: ${t(locale, "slack.modal.duplicate").replace("{taskLink}", `<${taskUrl}|${safeTitle}>`)}`,
                },
              },
            ],
          },
        });
        return;
      }

      await showCreateTaskModal({
        client,
        viewId: viewId!,
        messageText,
        channelId,
        messageTs,
        slackUserId: shortcut.user.id,
        locale,
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
              title: { type: "plain_text", text: t(locale, "slack.modal.title") },
              close: { type: "plain_text", text: t(locale, "slack.modal.close") },
              blocks: [
                {
                  type: "section",
                  text: { type: "mrkdwn", text: t(locale, "slack.modal.error") },
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

  // Duplicate confirmation: user chose "Create anyway"
  boltApp.view("create_task_duplicate_confirm", async ({ ack, view, client }) => {
    // Respond with a loading modal while we prepare the create-task form
    const metadata = JSON.parse(view.private_metadata);
    const locale = (metadata.locale ?? "en") as Locale;

    await ack({
      response_action: "update",
      view: {
        type: "modal",
        callback_id: "create_task_modal_loading",
        title: { type: "plain_text", text: t(locale, "slack.modal.title") },
        close: { type: "plain_text", text: t(locale, "slack.modal.cancel") },
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: t(locale, "slack.modal.loading") },
          },
        ],
      },
    });

    try {
      await showCreateTaskModal({
        client,
        viewId: view.id,
        messageText: metadata.messageText,
        channelId: metadata.channelId,
        messageTs: metadata.messageTs,
        slackUserId: metadata.slackUserId,
        locale,
      });
    } catch (err) {
      console.error("Error in duplicate confirm flow:", err);
      try {
        await client.views.update({
          view_id: view.id,
          view: {
            type: "modal",
            callback_id: "create_task_modal_error",
            title: { type: "plain_text", text: t(locale, "slack.modal.title") },
            close: { type: "plain_text", text: t(locale, "slack.modal.close") },
            blocks: [
              {
                type: "section",
                text: { type: "mrkdwn", text: t(locale, "slack.modal.error") },
              },
            ],
          },
        });
      } catch (updateErr) {
        console.error("Failed to update modal with error:", updateErr);
      }
    }
  });

  // Modal submission: create_task_modal
  boltApp.view("create_task_modal", async ({ ack, view, client, body }) => {
    await ack();

    const metadata = JSON.parse(view.private_metadata);
    const title = view.state.values.title_block.title.value ?? "Untitled task";
    const deadlineTimestamp = view.state.values.deadline_block.deadline.selected_date_time;

    // Resolve selected users from multi_users_select
    const selectedUserIds: string[] = view.state.values.users_block?.users?.selected_users ?? [];
    const assigneeIds: string[] = [];
    const assigneeMentions: string[] = [];

    for (const slackUid of selectedUserIds) {
      try {
        const result = await client.users.info({ user: slackUid });
        if (result.user?.profile?.email) {
          const user = await userService.findOrCreateUser({
            slackUserId: slackUid,
            email: result.user.profile.email,
            displayName:
              result.user.profile.display_name || result.user.profile.real_name || slackUid,
            avatarUrl: result.user.profile.image_72 ?? null,
          });
          // Skip deactivated users
          if (user.deactivatedAt != null) continue;
          if (!assigneeIds.includes(user.id)) {
            assigneeIds.push(user.id);
          }
        }
      } catch {
        // Skip unresolvable users
      }
      assigneeMentions.push(`<@${slackUid}>`);
    }

    // Resolve selected groups from multi_static_select
    const selectedGroupOptions: { value: string }[] =
      view.state.values.groups_block?.groups?.selected_options ?? [];
    const selectedGroupIds = new Set(selectedGroupOptions.map((o) => o.value));
    const groupCandidates: { groupId: string; mentionToken: string; userIds: string[] }[] =
      metadata.groupCandidates ?? [];

    for (const candidate of groupCandidates) {
      if (!selectedGroupIds.has(candidate.groupId)) continue;
      for (const userId of candidate.userIds) {
        if (!assigneeIds.includes(userId)) {
          assigneeIds.push(userId);
        }
      }
      assigneeMentions.push(candidate.mentionToken);
    }

    try {
      const task = await taskService.createTask({
        title,
        description: metadata.messageText || undefined,
        deadline: deadlineTimestamp ? new Date(deadlineTimestamp * 1000) : null,
        slackMessageTs: metadata.messageTs,
        slackChannelId: metadata.channelId,
        slackPermalink: metadata.permalink,
        createdById: metadata.createdById,
        assigneeIds,
      });

      // Post confirmation message
      try {
        const loc = metadata.locale ?? "en";
        const who =
          assigneeMentions.length > 0
            ? assigneeMentions.join(" ")
            : t(loc, "slack.reply.fallbackAssignee");
        // Slack link labels can't contain `|` or `>`; escape defensively.
        const safeTitle = task.title.replace(/[|>]/g, " ");
        const taskLink = `<${config.baseUrl}/tasks#task-${task.id}|${safeTitle}>`;
        const replyText = t(loc, "slack.reply.assigned")
          .replace("{taskLink}", taskLink)
          .replace("{who}", who);
        await client.chat.postMessage({
          channel: metadata.channelId,
          thread_ts: metadata.messageTs,
          text: replyText,
        });
      } catch {
        // Non-critical: confirmation message failed
      }
    } catch (err) {
      console.error("Error creating task from modal:", err);
      const loc = metadata.locale ?? "en";
      try {
        await client.chat.postEphemeral({
          channel: metadata.channelId,
          user: body.user.id,
          text: t(loc, "slack.modal.error"),
        });
      } catch (ephemeralErr) {
        console.error("Failed to send ephemeral error message:", ephemeralErr);
      }
    }
  });

  // Message shortcut: add_snippet
  // No modal — just ack, process in background, and use :memo: reaction as
  // success feedback (same as the automatic event handler). Errors are reported
  // via ephemeral messages.
  boltApp.shortcut("add_snippet", async ({ shortcut, ack, client }) => {
    await ack();

    if (shortcut.type !== "message_action") return;

    const existingUser = await userService.findUserBySlackUserId(shortcut.user.id);
    const locale = (existingUser?.locale ?? "en") as Locale;

    const messageText =
      blocksToMrkdwn((shortcut.message as { blocks?: unknown }).blocks) ??
      shortcut.message.text ??
      "";
    const channelId = shortcut.channel.id;
    const messageTs = shortcut.message_ts;
    const authorSlackId = (shortcut.message as { user?: string }).user ?? shortcut.user.id;

    try {
      const userMentionIds = [...new Set(extractUserMentions(messageText))];
      const usergroupMentionIds = [...new Set(extractUsergroupMentions(messageText))];

      if (userMentionIds.length === 0 && usergroupMentionIds.length === 0) {
        await client.chat.postEphemeral({
          channel: channelId,
          user: shortcut.user.id,
          text: t(locale, "slack.snippet.noMentions"),
        });
        return;
      }

      const existing = await snippetService.findSnippetBySlackMessage(channelId, messageTs);
      if (existing) {
        await client.chat.postEphemeral({
          channel: channelId,
          user: shortcut.user.id,
          text: t(locale, "slack.snippet.duplicate"),
        });
        return;
      }

      const resolver = createSlackLabelResolver(client);
      const hydratedText = await hydrateMentionLabels(messageText, resolver);

      // Resolve mentioned users
      const mentionedDbUserIds: string[] = [];
      for (const slackUid of userMentionIds) {
        try {
          const result = await client.users.info({ user: slackUid });
          if (result.user?.profile?.email) {
            const user = await userService.findOrCreateUser({
              slackUserId: slackUid,
              email: result.user.profile.email,
              displayName:
                result.user.profile.display_name || result.user.profile.real_name || slackUid,
              avatarUrl: result.user.profile.image_72 ?? null,
            });
            if (user.deactivatedAt == null) mentionedDbUserIds.push(user.id);
          }
        } catch {
          // Skip unresolvable users
        }
      }

      // Resolve mentioned usergroups
      const mentionedDbUsergroupIds: string[] = [];
      for (const groupId of usergroupMentionIds) {
        try {
          const groupHandle = await resolver.usergroup(groupId);
          let groupName = groupHandle ?? groupId;
          try {
            const groupsRes = await client.usergroups.list({ include_disabled: false });
            const group = (groupsRes.usergroups ?? []).find((g) => g.id === groupId);
            if (group) groupName = group.name ?? groupName;
          } catch {
            // Use handle as fallback
          }
          const usergroup = await snippetService.findOrCreateUsergroup(
            groupId,
            groupName,
            groupHandle ?? undefined,
          );
          mentionedDbUsergroupIds.push(usergroup.id);

          // Sync group membership
          try {
            if (await snippetService.isUsergroupMembershipStale(usergroup.id)) {
              const membersRes = await client.usergroups.users.list({ usergroup: groupId });
              const memberDbIds: string[] = [];
              for (const memberSlackUid of membersRes.users ?? []) {
                try {
                  const memberResult = await client.users.info({ user: memberSlackUid });
                  if (memberResult.user?.profile?.email) {
                    const member = await userService.findOrCreateUser({
                      slackUserId: memberSlackUid,
                      email: memberResult.user.profile.email,
                      displayName:
                        memberResult.user.profile.display_name ||
                        memberResult.user.profile.real_name ||
                        memberSlackUid,
                      avatarUrl: memberResult.user.profile.image_72 ?? null,
                    });
                    if (member) memberDbIds.push(member.id);
                  }
                } catch {
                  // Skip unresolvable members
                }
              }
              await snippetService.syncUsergroupMembers(usergroup.id, memberDbIds);
            }
          } catch {
            // Non-critical
          }
        } catch {
          // Skip unresolvable groups
        }
      }

      // Resolve message author
      const authorInfo = await client.users.info({ user: authorSlackId });
      const author = await userService.findOrCreateUser({
        slackUserId: authorSlackId,
        email: authorInfo.user?.profile?.email ?? "",
        displayName:
          authorInfo.user?.profile?.display_name ||
          authorInfo.user?.profile?.real_name ||
          authorSlackId,
        avatarUrl: authorInfo.user?.profile?.image_72 ?? null,
      });

      if (author.deactivatedAt != null) {
        console.debug(`[snippet-shortcut] Skipping message from deactivated user ${authorSlackId}`);
        return;
      }

      let permalink: string | undefined;
      try {
        const permalinkRes = await client.chat.getPermalink({
          channel: channelId,
          message_ts: messageTs,
        });
        permalink = permalinkRes.permalink ?? undefined;
      } catch {
        // Non-critical
      }

      const postedAt = new Date(Number(messageTs.split(".")[0]) * 1000);
      const created = await snippetService.createSnippet({
        content: hydratedText,
        postedAt,
        slackMessageTs: messageTs,
        slackChannelId: channelId,
        slackPermalink: permalink,
        postedById: author.id,
        mentionedUserIds: mentionedDbUserIds,
        mentionedUsergroupIds: mentionedDbUsergroupIds,
      });

      if (created) {
        console.log(
          `[snippet-shortcut] Created snippet for message ${messageTs} in channel ${channelId}`,
        );
        try {
          await client.reactions.add({
            channel: channelId,
            timestamp: messageTs,
            name: "memo",
          });
        } catch (err) {
          console.warn(
            `[snippet-shortcut] Failed to add reaction to ${channelId}/${messageTs}:`,
            err,
          );
        }
      }
    } catch (err) {
      console.error("Error in add_snippet shortcut:", err);
      try {
        await client.chat.postEphemeral({
          channel: channelId,
          user: shortcut.user.id,
          text: t(locale, "slack.snippet.error"),
        });
      } catch {
        // Best effort
      }
    }
  });

  // Message event listener for snippet and kudos capture
  boltApp.message(async ({ message, client }) => {
    try {
      // Skip non-standard messages (edits, deletes, bot messages, etc.)
      if (message.subtype) return;
      if (!("text" in message)) return;
      if (!("user" in message) || !message.user) return;
      if (!("channel" in message) || !message.channel) return;

      const channelId = message.channel;
      const messageTs = message.ts;

      // Check if this channel is monitored for snippets or kudos
      const [isSnippetMonitored, isKudosMonitored] = await Promise.all([
        snippetService.isSnippetChannel(channelId),
        kudosService.isKudosChannel(channelId),
      ]);
      if (!isSnippetMonitored && !isKudosMonitored) {
        return;
      }

      // Extract message text
      const messageText =
        blocksToMrkdwn((message as { blocks?: unknown }).blocks) ?? message.text ?? "";

      // Shared helpers for resolving users and usergroups
      const resolver = createSlackLabelResolver(client);

      async function resolveSlackUserToDb(slackUid: string) {
        const result = await client.users.info({ user: slackUid });
        if (result.user?.profile?.email) {
          return userService.findOrCreateUser({
            slackUserId: slackUid,
            email: result.user.profile.email,
            displayName:
              result.user.profile.display_name || result.user.profile.real_name || slackUid,
            avatarUrl: result.user.profile.image_72 ?? null,
          });
        }
        return null;
      }

      async function resolveUsergroupToDb(groupId: string) {
        const groupHandle = await resolver.usergroup(groupId);
        let groupName = groupHandle ?? groupId;
        try {
          const groupsRes = await client.usergroups.list({ include_disabled: false });
          const group = (groupsRes.usergroups ?? []).find((g) => g.id === groupId);
          if (group) groupName = group.name ?? groupName;
        } catch {
          // Use handle as fallback
        }
        const usergroup = await snippetService.findOrCreateUsergroup(
          groupId,
          groupName,
          groupHandle ?? undefined,
        );

        // Sync group membership (skip if synced within TTL)
        try {
          if (await snippetService.isUsergroupMembershipStale(usergroup.id)) {
            const membersRes = await client.usergroups.users.list({ usergroup: groupId });
            const memberDbIds: string[] = [];
            for (const slackUid of membersRes.users ?? []) {
              try {
                const member = await resolveSlackUserToDb(slackUid);
                if (member) memberDbIds.push(member.id);
              } catch {
                // Skip unresolvable members
              }
            }
            await snippetService.syncUsergroupMembers(usergroup.id, memberDbIds);
          }
        } catch {
          // Non-critical
        }

        return usergroup;
      }

      // Snippet processing
      if (isSnippetMonitored) {
        try {
          const userMentionIds = [...new Set(extractUserMentions(messageText))];
          const usergroupMentionIds = [...new Set(extractUsergroupMentions(messageText))];

          if (userMentionIds.length === 0 && usergroupMentionIds.length === 0) {
            console.debug(
              `[snippet] No mentions found in message ${messageTs} in channel ${channelId}`,
            );
          } else {
            console.log(
              `[snippet] Processing message ${messageTs} in channel ${channelId} (users: ${userMentionIds.join(",")}, groups: ${usergroupMentionIds.join(",")})`,
            );

            const existing = await snippetService.findSnippetBySlackMessage(channelId, messageTs);
            if (existing) {
              console.debug(
                `[snippet] Duplicate message ${messageTs} in channel ${channelId}, skipping`,
              );
            } else {
              const hydratedText = await hydrateMentionLabels(messageText, resolver);

              const mentionedDbUserIds: string[] = [];
              for (const slackUid of userMentionIds) {
                try {
                  const user = await resolveSlackUserToDb(slackUid);
                  if (user && user.deactivatedAt == null) mentionedDbUserIds.push(user.id);
                } catch {
                  // Skip unresolvable users
                }
              }

              const mentionedDbUsergroupIds: string[] = [];
              for (const groupId of usergroupMentionIds) {
                try {
                  const usergroup = await resolveUsergroupToDb(groupId);
                  mentionedDbUsergroupIds.push(usergroup.id);
                } catch {
                  // Skip unresolvable groups
                }
              }

              const authorInfo = await client.users.info({ user: message.user });
              const author = await userService.findOrCreateUser({
                slackUserId: message.user,
                email: authorInfo.user?.profile?.email ?? "",
                displayName:
                  authorInfo.user?.profile?.display_name ||
                  authorInfo.user?.profile?.real_name ||
                  message.user,
                avatarUrl: authorInfo.user?.profile?.image_72 ?? null,
              });

              if (author.deactivatedAt != null) {
                console.debug(`[snippet] Skipping message from deactivated user ${message.user}`);
              } else {
                let permalink: string | undefined;
                try {
                  const permalinkRes = await client.chat.getPermalink({
                    channel: channelId,
                    message_ts: messageTs,
                  });
                  permalink = permalinkRes.permalink ?? undefined;
                } catch {
                  // Non-critical
                }

                const postedAt = new Date(Number(messageTs.split(".")[0]) * 1000);
                const created = await snippetService.createSnippet({
                  content: hydratedText,
                  postedAt,
                  slackMessageTs: messageTs,
                  slackChannelId: channelId,
                  slackPermalink: permalink,
                  postedById: author.id,
                  mentionedUserIds: mentionedDbUserIds,
                  mentionedUsergroupIds: mentionedDbUsergroupIds,
                });

                if (created) {
                  console.log(
                    `[snippet] Created snippet for message ${messageTs} in channel ${channelId}`,
                  );
                  try {
                    await client.reactions.add({
                      channel: channelId,
                      timestamp: messageTs,
                      name: "memo",
                    });
                  } catch (err) {
                    console.warn(
                      `[snippet] Failed to add reaction to ${channelId}/${messageTs}:`,
                      err,
                    );
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error("[snippet] Error in snippet processing:", err);
        }
      }

      // Kudos processing
      if (isKudosMonitored) {
        try {
          const parsedEntries = parseKudosMessage(messageText);
          if (parsedEntries.length === 0) {
            console.debug(
              `[kudos] No kudos entries found in message ${messageTs} in channel ${channelId}`,
            );
          } else {
            console.log(
              `[kudos] Processing message ${messageTs} in channel ${channelId} (${parsedEntries.length} entries)`,
            );

            const existing = await kudosService.findKudosBySlackMessage(channelId, messageTs);
            if (existing) {
              console.debug(
                `[kudos] Duplicate message ${messageTs} in channel ${channelId}, skipping`,
              );
            } else {
              // Resolve message author
              const authorInfo = await client.users.info({ user: message.user });
              const author = await userService.findOrCreateUser({
                slackUserId: message.user,
                email: authorInfo.user?.profile?.email ?? "",
                displayName:
                  authorInfo.user?.profile?.display_name ||
                  authorInfo.user?.profile?.real_name ||
                  message.user,
                avatarUrl: authorInfo.user?.profile?.image_72 ?? null,
              });

              if (author.deactivatedAt != null) {
                console.debug(`[kudos] Skipping message from deactivated user ${message.user}`);
              } else {
                // Resolve each entry's target mentions
                const resolvedEntries: {
                  message: string;
                  mentionedUserIds: string[];
                  mentionedUsergroupIds: string[];
                }[] = [];

                for (const entry of parsedEntries) {
                  const mentionedUserIds: string[] = [];
                  const mentionedUsergroupIds: string[] = [];

                  for (const mention of entry.targetMentions) {
                    // User mention: <@U123>
                    const userMatch = mention.match(/<@(U[A-Z0-9]+)>/);
                    if (userMatch) {
                      try {
                        const user = await resolveSlackUserToDb(userMatch[1]);
                        if (user && user.deactivatedAt == null) mentionedUserIds.push(user.id);
                      } catch {
                        // Skip
                      }
                      continue;
                    }

                    // Usergroup mention: <!subteam^S123> or <!subteam^S123|handle>
                    // Expand group members to individual user mentions at write time
                    // so read queries don't depend on current membership.
                    const groupMatch = mention.match(/<!subteam\^(S[A-Z0-9]+)/);
                    if (groupMatch) {
                      try {
                        const usergroup = await resolveUsergroupToDb(groupMatch[1]);
                        mentionedUsergroupIds.push(usergroup.id);
                        // Expand group members into mentionedUserIds at write time
                        // so read queries don't depend on current membership.
                        const membersRes = await client.usergroups.users.list({
                          usergroup: groupMatch[1],
                        });
                        for (const slackUid of membersRes.users ?? []) {
                          try {
                            const member = await resolveSlackUserToDb(slackUid);
                            if (member && member.deactivatedAt == null)
                              mentionedUserIds.push(member.id);
                          } catch {
                            // Skip
                          }
                        }
                      } catch {
                        // Skip
                      }
                    }
                  }

                  // Hydrate the entry message with mention labels
                  const hydratedMessage = await hydrateMentionLabels(entry.message, resolver);

                  if (mentionedUserIds.length > 0 || mentionedUsergroupIds.length > 0) {
                    resolvedEntries.push({
                      message: hydratedMessage,
                      mentionedUserIds,
                      mentionedUsergroupIds,
                    });
                  }
                }

                if (resolvedEntries.length > 0) {
                  let permalink: string | undefined;
                  try {
                    const permalinkRes = await client.chat.getPermalink({
                      channel: channelId,
                      message_ts: messageTs,
                    });
                    permalink = permalinkRes.permalink ?? undefined;
                  } catch {
                    // Non-critical
                  }

                  const postedAt = new Date(Number(messageTs.split(".")[0]) * 1000);
                  const created = await kudosService.createKudos({
                    slackMessageTs: messageTs,
                    slackChannelId: channelId,
                    slackPermalink: permalink,
                    postedAt,
                    postedById: author.id,
                    entries: resolvedEntries,
                  });

                  if (created) {
                    console.log(
                      `[kudos] Created kudos for message ${messageTs} in channel ${channelId} (${resolvedEntries.length} entries)`,
                    );
                    try {
                      await client.reactions.add({
                        channel: channelId,
                        timestamp: messageTs,
                        name: "tada",
                      });
                    } catch (err) {
                      console.warn(
                        `[kudos] Failed to add reaction to ${channelId}/${messageTs}:`,
                        err,
                      );
                    }
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error("[kudos] Error in kudos processing:", err);
        }
      }
    } catch (err) {
      console.error("[message] Error in message handler:", err);
    }
  });

  return { boltApp, receiver: receiver ?? null };
}
