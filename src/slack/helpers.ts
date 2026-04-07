import type { WebClient } from "@slack/web-api";

interface SlackMention {
  slackUserId: string;
  email: string;
  displayName: string;
}

// Extract user mentions like <@U12345> from message text
function extractUserMentions(text: string): string[] {
  const matches = text.match(/<@(U[A-Z0-9]+)>/g) ?? [];
  return matches.map((m) => m.replace(/<@|>/g, ""));
}

// Extract usergroup mentions like <!subteam^S12345> from message text
function extractUsergroupMentions(text: string): string[] {
  const matches = text.match(/<!subteam\^(S[A-Z0-9]+)(?:\|[^>]*)?>/g) ?? [];
  return matches.map((m) => {
    const match = m.match(/<!subteam\^(S[A-Z0-9]+)/);
    return match![1];
  });
}

export async function resolveMentions(
  client: WebClient,
  text: string,
): Promise<SlackMention[]> {
  const userIds = new Set<string>();
  const mentions: SlackMention[] = [];

  // Direct user mentions
  for (const userId of extractUserMentions(text)) {
    userIds.add(userId);
  }

  // Usergroup mentions - expand to individual users
  for (const groupId of extractUsergroupMentions(text)) {
    try {
      const result = await client.usergroups.users.list({ usergroup: groupId });
      if (result.users) {
        for (const userId of result.users) {
          userIds.add(userId);
        }
      }
    } catch {
      // Skip unresolvable groups
    }
  }

  // Resolve each user
  for (const userId of userIds) {
    try {
      const result = await client.users.info({ user: userId });
      if (result.user?.profile?.email) {
        mentions.push({
          slackUserId: userId,
          email: result.user.profile.email,
          displayName:
            result.user.profile.display_name ||
            result.user.profile.real_name ||
            userId,
        });
      }
    } catch {
      // Skip unresolvable users
    }
  }

  return mentions;
}
