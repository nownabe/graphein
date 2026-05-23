// Render-time Slack entity label resolution.
//
// Existing tasks stored with unlabeled entities (`<@U1>`, `<#C1>`,
// `<!subteam^S1>`) need to show human-readable names. Users are resolved from
// the users table (every mentioned user is already upserted on ingestion).
// Channels and usergroups are resolved via the Slack API with an in-memory
// cache shared across requests.

import type { App } from "@slack/bolt";
import { createSlackLabelResolver } from "./helpers";
import { createCustomEmojiResolver, resolveEmojiMap } from "./emoji";
import type { MrkdwnOptions } from "./mrkdwn";
import type { UserService } from "../../application/users/service";
import type { CacheStore } from "../../infrastructure/cache/store";

export function extractSlackEntityIds(text: string): {
  users: string[];
  channels: string[];
  usergroups: string[];
  emoji: string[];
} {
  const users = new Set<string>();
  const channels = new Set<string>();
  const usergroups = new Set<string>();
  const emoji = new Set<string>();
  for (const m of text.matchAll(/<@(U[A-Z0-9]+)(?:\|[^>]*)?>/g)) users.add(m[1]);
  for (const m of text.matchAll(/<#(C[A-Z0-9]+)(?:\|[^>]*)?>/g)) channels.add(m[1]);
  for (const m of text.matchAll(/<!subteam\^(S[A-Z0-9]+)(?:\|[^>]*)?>/g)) usergroups.add(m[1]);
  for (const m of text.matchAll(/:([a-z0-9_+-]+):/g)) emoji.add(m[1]);
  return {
    users: [...users],
    channels: [...channels],
    usergroups: [...usergroups],
    emoji: [...emoji],
  };
}

export function createLabelBuilder(boltApp: App, userService: UserService, cache?: CacheStore) {
  let _slackResolver: ReturnType<typeof createSlackLabelResolver> | null = null;
  function slackResolver() {
    if (!_slackResolver) {
      _slackResolver = createSlackLabelResolver(boltApp.client, cache);
    }
    return _slackResolver;
  }

  let _customEmojiResolver: ReturnType<typeof createCustomEmojiResolver> | null = null;
  function customEmojiResolver() {
    if (!_customEmojiResolver) {
      _customEmojiResolver = createCustomEmojiResolver(boltApp.client, cache);
    }
    return _customEmojiResolver;
  }

  return async function buildMrkdwnLabels(
    texts: (string | null | undefined)[],
  ): Promise<MrkdwnOptions> {
    const userIds = new Set<string>();
    const channelIds = new Set<string>();
    const usergroupIds = new Set<string>();
    const emojiNames = new Set<string>();

    for (const t of texts) {
      if (!t) continue;
      const ids = extractSlackEntityIds(t);
      for (const id of ids.users) userIds.add(id);
      for (const id of ids.channels) channelIds.add(id);
      for (const id of ids.usergroups) usergroupIds.add(id);
      for (const name of ids.emoji) emojiNames.add(name);
    }

    const users: Record<string, string> = {};
    if (userIds.size > 0) {
      const resolved = await userService.findUsersBySlackUserIds([...userIds]);
      for (const u of resolved) {
        users[u.slackUserId] = u.displayName;
      }
    }

    const resolver = slackResolver();

    const channels: Record<string, string> = {};
    await Promise.all(
      [...channelIds].map(async (id) => {
        const name = await resolver.channel(id);
        if (name) channels[id] = name;
      }),
    );

    const usergroups: Record<string, string> = {};
    await Promise.all(
      [...usergroupIds].map(async (id) => {
        const name = await resolver.usergroup(id);
        if (name) usergroups[id] = name;
      }),
    );

    const emoji =
      emojiNames.size > 0 ? await resolveEmojiMap([...emojiNames], customEmojiResolver()) : {};

    return { users, channels, usergroups, emoji };
  };
}
