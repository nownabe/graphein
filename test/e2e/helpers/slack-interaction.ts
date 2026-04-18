import crypto from "node:crypto";
import { env } from "./env";

/**
 * Sign a Slack request payload using HMAC-SHA256.
 * Produces the same signature format that Slack uses to verify requests.
 */
function signRequest(body: string, timestamp: string): string {
  const sigBasestring = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac("sha256", env.slackSigningSecret);
  hmac.update(sigBasestring);
  return `v0=${hmac.digest("hex")}`;
}

/**
 * Send a signed interaction payload to the Graphein server's /slack/interactions endpoint.
 * This simulates what Slack sends when a user submits a modal or triggers a shortcut.
 */
async function sendInteraction(payload: Record<string, unknown>): Promise<Response> {
  const payloadJson = JSON.stringify(payload);
  const body = `payload=${encodeURIComponent(payloadJson)}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signRequest(body, timestamp);

  return fetch(`${env.grapheinUrl}/slack/interactions`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": signature,
    },
    body,
  });
}

/**
 * Simulate a view_submission for the "add_task_modal" callback.
 * This is what Slack sends when a user fills in the Add Task modal and clicks Submit.
 */
export async function submitAddTaskModal(opts: {
  channelId: string;
  messageTs: string;
  messageText: string;
  permalink: string;
  createdById: string;
  title: string;
  slackUserId: string;
  assigneeSlackUserIds?: string[];
  deadline?: number;
}): Promise<Response> {
  const privateMetadata = JSON.stringify({
    channelId: opts.channelId,
    messageTs: opts.messageTs,
    messageText: opts.messageText,
    permalink: opts.permalink,
    createdById: opts.createdById,
    groupCandidates: [],
    locale: "en",
  });

  const payload = {
    type: "view_submission",
    user: {
      id: opts.slackUserId,
      name: "e2e-test-user",
    },
    view: {
      callback_id: "add_task_modal",
      private_metadata: privateMetadata,
      state: {
        values: {
          title_block: {
            title: {
              type: "plain_text_input",
              value: opts.title,
            },
          },
          deadline_block: {
            deadline: {
              type: "datetimepicker",
              selected_date_time: opts.deadline ?? null,
            },
          },
          users_block: {
            users: {
              type: "multi_users_select",
              selected_users: opts.assigneeSlackUserIds ?? [opts.slackUserId],
            },
          },
        },
      },
    },
  };

  return sendInteraction(payload);
}

/**
 * Simulate a view_submission for the "add_snippet_modal" callback.
 * This is what Slack sends when a user confirms adding a snippet via the shortcut modal.
 */
export async function submitAddSnippetModal(opts: {
  channelId: string;
  messageTs: string;
  messageText: string;
  authorSlackId: string;
  slackUserId: string;
}): Promise<Response> {
  const privateMetadata = JSON.stringify({
    channelId: opts.channelId,
    messageTs: opts.messageTs,
    messageText: opts.messageText,
    authorSlackId: opts.authorSlackId,
    locale: "en",
  });

  const payload = {
    type: "view_submission",
    user: {
      id: opts.slackUserId,
      name: "e2e-test-user",
    },
    view: {
      id: `V_e2e_snippet_${Date.now()}`,
      callback_id: "add_snippet_modal",
      private_metadata: privateMetadata,
      state: {
        values: {},
      },
    },
  };

  return sendInteraction(payload);
}
