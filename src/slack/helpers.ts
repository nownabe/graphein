import type { WebClient } from "@slack/web-api";

interface SlackMention {
  slackUserId: string;
  email: string;
  displayName: string;
}

export interface MentionLabelResolver {
  user(id: string): Promise<string | undefined>;
  channel(id: string): Promise<string | undefined>;
  usergroup(id: string): Promise<string | undefined>;
}

// Rewrite unlabeled Slack entities in `text` to include display labels, so
// the stored message is self-contained and can be rendered without additional
// Slack API calls. Already-labeled entities (`<@U1|alice>`) are left as-is.
export async function hydrateMentionLabels(
  text: string,
  resolver: MentionLabelResolver,
): Promise<string> {
  const userIds = new Set<string>();
  const channelIds = new Set<string>();
  const usergroupIds = new Set<string>();

  for (const m of text.matchAll(/<@(U[A-Z0-9]+)>/g)) userIds.add(m[1]);
  for (const m of text.matchAll(/<#(C[A-Z0-9]+)>/g)) channelIds.add(m[1]);
  for (const m of text.matchAll(/<!subteam\^(S[A-Z0-9]+)>/g))
    usergroupIds.add(m[1]);

  const [userEntries, channelEntries, usergroupEntries] = await Promise.all([
    Promise.all(
      [...userIds].map(async (id) => [id, await resolver.user(id)] as const),
    ),
    Promise.all(
      [...channelIds].map(
        async (id) => [id, await resolver.channel(id)] as const,
      ),
    ),
    Promise.all(
      [...usergroupIds].map(
        async (id) => [id, await resolver.usergroup(id)] as const,
      ),
    ),
  ]);

  const users = new Map(userEntries);
  const channels = new Map(channelEntries);
  const usergroups = new Map(usergroupEntries);

  return text
    .replace(/<@(U[A-Z0-9]+)>/g, (full, id) => {
      const name = users.get(id);
      return name ? `<@${id}|${name}>` : full;
    })
    .replace(/<#(C[A-Z0-9]+)>/g, (full, id) => {
      const name = channels.get(id);
      return name ? `<#${id}|${name}>` : full;
    })
    .replace(/<!subteam\^(S[A-Z0-9]+)>/g, (full, id) => {
      const name = usergroups.get(id);
      return name ? `<!subteam^${id}|${name}>` : full;
    });
}

// Adapter that wraps a Slack WebClient as a MentionLabelResolver. Results are
// memoized per-instance so repeated lookups in the same call only hit the API
// once.
export function createSlackLabelResolver(
  client: WebClient,
): MentionLabelResolver {
  const userCache = new Map<string, string | undefined>();
  const channelCache = new Map<string, string | undefined>();
  let usergroupIndex: Map<string, string> | null = null;

  return {
    async user(id) {
      if (userCache.has(id)) return userCache.get(id);
      try {
        const r = await client.users.info({ user: id });
        const p = r.user?.profile;
        const name = p?.display_name || p?.real_name || undefined;
        if (name) userCache.set(id, name);
        return name;
      } catch {
        return undefined;
      }
    },
    async channel(id) {
      if (channelCache.has(id)) return channelCache.get(id);
      try {
        const r = await client.conversations.info({ channel: id });
        const name = (r.channel as { name?: string } | undefined)?.name;
        if (name) channelCache.set(id, name);
        return name;
      } catch {
        return undefined;
      }
    },
    async usergroup(id) {
      if (!usergroupIndex) {
        usergroupIndex = new Map();
        try {
          const r = await client.usergroups.list({ include_disabled: true });
          for (const g of r.usergroups ?? []) {
            if (g.id) {
              const name = g.handle || g.name;
              if (name) usergroupIndex.set(g.id, name);
            }
          }
        } catch {
          // leave index empty
        }
      }
      return usergroupIndex.get(id);
    },
  };
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
