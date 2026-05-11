import type { WebClient } from "@slack/web-api";
import type { CacheStore } from "../../infrastructure/cache/store";

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
  for (const m of text.matchAll(/<!subteam\^(S[A-Z0-9]+)>/g)) usergroupIds.add(m[1]);

  const [userEntries, channelEntries, usergroupEntries] = await Promise.all([
    Promise.all([...userIds].map(async (id) => [id, await resolver.user(id)] as const)),
    Promise.all([...channelIds].map(async (id) => [id, await resolver.channel(id)] as const)),
    Promise.all([...usergroupIds].map(async (id) => [id, await resolver.usergroup(id)] as const)),
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

// Default TTL for Slack label cache entries (1 hour).
const LABEL_CACHE_TTL_MS = 60 * 60 * 1000;

// Adapter that wraps a Slack WebClient as a MentionLabelResolver.
//
// When a `CacheStore` is provided the results are persisted there with a TTL so
// they survive restarts and are shared across instances. Without a store the
// resolver falls back to in-memory Maps (suitable for short-lived, per-request
// use in bolt.ts).
export function createSlackLabelResolver(
  client: WebClient,
  cache?: CacheStore,
): MentionLabelResolver {
  // Lightweight in-memory maps used when no external cache is provided.
  const localUserCache = new Map<string, string | undefined>();
  const localChannelCache = new Map<string, string | undefined>();
  let localUsergroupIndex: Map<string, string> | null = null;

  // Helpers to interact with either the CacheStore or local maps.
  async function getCached(
    prefix: string,
    id: string,
    localMap: Map<string, string | undefined>,
  ): Promise<{ hit: boolean; value: string | undefined }> {
    if (cache) {
      const v = await cache.get(`slack:${prefix}:${id}`);
      if (v !== undefined) return { hit: true, value: v };
      return { hit: false, value: undefined };
    }
    if (localMap.has(id)) return { hit: true, value: localMap.get(id) };
    return { hit: false, value: undefined };
  }

  async function setCached(
    prefix: string,
    id: string,
    value: string,
    localMap: Map<string, string | undefined>,
  ): Promise<void> {
    if (cache) {
      await cache.set(`slack:${prefix}:${id}`, value, LABEL_CACHE_TTL_MS);
    } else {
      localMap.set(id, value);
    }
  }

  return {
    async user(id) {
      const { hit, value } = await getCached("user", id, localUserCache);
      if (hit) return value;
      try {
        const r = await client.users.info({ user: id });
        const p = r.user?.profile;
        const name = p?.display_name || p?.real_name || undefined;
        if (name) await setCached("user", id, name, localUserCache);
        return name;
      } catch {
        return undefined;
      }
    },
    async channel(id) {
      const { hit, value } = await getCached("channel", id, localChannelCache);
      if (hit) return value;
      try {
        const r = await client.conversations.info({ channel: id });
        const name = (r.channel as { name?: string } | undefined)?.name;
        if (name) await setCached("channel", id, name, localChannelCache);
        return name;
      } catch {
        return undefined;
      }
    },
    async usergroup(id) {
      if (cache) {
        const cached = await cache.get(`slack:usergroup:${id}`);
        if (cached !== undefined) return cached;

        // Check if the full index was already loaded in this TTL window.
        const indexLoaded = await cache.get("slack:usergroup:_index_loaded");
        if (!indexLoaded) {
          try {
            const r = await client.usergroups.list({ include_disabled: true });
            for (const g of r.usergroups ?? []) {
              if (g.id) {
                const name = g.handle || g.name;
                if (name) await cache.set(`slack:usergroup:${g.id}`, name, LABEL_CACHE_TTL_MS);
              }
            }
            await cache.set("slack:usergroup:_index_loaded", "1", LABEL_CACHE_TTL_MS);
          } catch {
            // leave cache empty
          }
          // Re-read after populating
          const v = await cache.get(`slack:usergroup:${id}`);
          return v ?? undefined;
        }
        return undefined;
      }

      // Local fallback
      if (!localUsergroupIndex) {
        localUsergroupIndex = new Map();
        try {
          const r = await client.usergroups.list({ include_disabled: true });
          for (const g of r.usergroups ?? []) {
            if (g.id) {
              const name = g.handle || g.name;
              if (name) localUsergroupIndex.set(g.id, name);
            }
          }
        } catch {
          // leave index empty
        }
      }
      return localUsergroupIndex.get(id);
    },
  };
}

// Extract user mentions like <@U12345> from message text
export function extractUserMentions(text: string): string[] {
  const matches = text.match(/<@(U[A-Z0-9]+)>/g) ?? [];
  return matches.map((m) => m.replace(/<@|>/g, ""));
}

// Extract usergroup mentions like <!subteam^S12345> from message text
export function extractUsergroupMentions(text: string): string[] {
  const matches = text.match(/<!subteam\^(S[A-Z0-9]+)(?:\|[^>]*)?>/g) ?? [];
  return matches.map((m) => {
    const match = m.match(/<!subteam\^(S[A-Z0-9]+)/);
    return match![1];
  });
}

export async function resolveMentions(client: WebClient, text: string): Promise<SlackMention[]> {
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
          displayName: result.user.profile.display_name || result.user.profile.real_name || userId,
        });
      }
    } catch {
      // Skip unresolvable users
    }
  }

  return mentions;
}
