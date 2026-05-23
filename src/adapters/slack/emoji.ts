// Slack emoji resolution.
//
// Resolves emoji shortcodes (`:thumbsup:`, `:rocket:`) to either Unicode
// characters (standard emoji) or image URLs (custom workspace emoji).
//
// Standard emoji are resolved via the `gemoji` package which provides the
// canonical GitHub/Slack shortcode-to-Unicode mapping. Custom workspace emoji
// are fetched from the Slack `emoji.list` API and cached.

import { gemoji } from "gemoji";
import type { WebClient } from "@slack/web-api";
import type { CacheStore } from "../../infrastructure/cache/store";

// ---------- Standard emoji lookup ----------

// Slack-specific aliases that don't exist in gemoji but are valid in Slack.
const SLACK_ALIASES: Record<string, string> = {
  slightly_smiling_face: "🙂",
  upside_down_face: "🙃",
  thumbsup: "👍",
  thumbsdown: "👎",
  simple_smile: "🙂",
  squirrel: "🐿️",
  shipit: "🐿️",
  pride: "🏳️‍🌈",
};

// Build a shortcode → Unicode map from the gemoji dataset.
const standardEmojiMap = new Map<string, string>();
for (const entry of gemoji) {
  for (const name of entry.names) {
    standardEmojiMap.set(name, entry.emoji);
  }
}
// Layer Slack-specific aliases on top.
for (const [name, emoji] of Object.entries(SLACK_ALIASES)) {
  if (!standardEmojiMap.has(name)) {
    standardEmojiMap.set(name, emoji);
  }
}

/** Look up a standard emoji by shortcode name. Returns undefined for unknown names. */
export function resolveStandardEmoji(name: string): string | undefined {
  return standardEmojiMap.get(name);
}

// ---------- Custom workspace emoji ----------

/** Result of resolving an emoji: either a Unicode string or an image URL. */
export type ResolvedEmoji = { type: "unicode"; value: string } | { type: "url"; value: string };

const EMOJI_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Create a resolver for custom workspace emoji.
 *
 * Fetches the full emoji list from Slack's `emoji.list` API on first call
 * and caches results. Alias chains (`:alias:` → another emoji name) are
 * resolved up to a small depth limit.
 */
export function createCustomEmojiResolver(client: WebClient, cache?: CacheStore) {
  let localIndex: Map<string, string> | null = null;

  async function ensureIndex(): Promise<Map<string, string>> {
    if (localIndex) return localIndex;

    // Try loading from cache.
    if (cache) {
      const loaded = await cache.get("slack:emoji:_index_loaded");
      if (loaded) {
        // Index was loaded in a previous call within the TTL. Individual
        // lookups will hit the cache below.
        localIndex = new Map();
        return localIndex;
      }
    }

    // Fetch from Slack API.
    const index = new Map<string, string>();
    try {
      const result = await client.emoji.list();
      for (const [name, value] of Object.entries(result.emoji ?? {})) {
        index.set(name, value);
      }
    } catch {
      // Return empty index on failure.
    }

    // Persist to cache.
    if (cache) {
      for (const [name, value] of index) {
        await cache.set(`slack:emoji:${name}`, value, EMOJI_CACHE_TTL_MS);
      }
      await cache.set("slack:emoji:_index_loaded", "1", EMOJI_CACHE_TTL_MS);
    }

    localIndex = index;
    return index;
  }

  return async function resolveCustomEmoji(name: string): Promise<string | undefined> {
    // Check cache first.
    if (cache) {
      const cached = await cache.get(`slack:emoji:${name}`);
      if (cached !== undefined) return resolveAliasChain(cached, name);
    }

    const index = await ensureIndex();
    const value = index.get(name);
    if (!value) return undefined;
    return resolveAliasChain(value, name);
  };

  function resolveAliasChain(value: string, _originalName: string): string | undefined {
    // Custom emoji values are either a URL or an alias like "alias:other_name".
    let current = value;
    for (let depth = 0; depth < 5; depth++) {
      if (!current.startsWith("alias:")) return current;
      const aliasTarget = current.slice("alias:".length);
      // Check if the alias target is a standard emoji.
      const standard = resolveStandardEmoji(aliasTarget);
      if (standard) return undefined; // Let the standard path handle it.
      const next = localIndex?.get(aliasTarget);
      if (!next) return undefined;
      current = next;
    }
    return undefined; // Alias chain too deep.
  }
}

/**
 * Resolve an emoji shortcode to a renderable result.
 *
 * Checks standard emoji first, then falls back to the custom resolver.
 * Returns undefined if the name cannot be resolved.
 */
export async function resolveEmoji(
  name: string,
  customResolver?: (name: string) => Promise<string | undefined>,
): Promise<ResolvedEmoji | undefined> {
  const unicode = resolveStandardEmoji(name);
  if (unicode) return { type: "unicode", value: unicode };

  if (customResolver) {
    const url = await customResolver(name);
    if (url) return { type: "url", value: url };
  }

  return undefined;
}

/**
 * Batch-resolve emoji names into a map suitable for MrkdwnOptions.
 *
 * Returns a record mapping emoji name → ResolvedEmoji for all resolvable names.
 */
export async function resolveEmojiMap(
  names: string[],
  customResolver?: (name: string) => Promise<string | undefined>,
): Promise<Record<string, ResolvedEmoji>> {
  const result: Record<string, ResolvedEmoji> = {};
  await Promise.all(
    names.map(async (name) => {
      const resolved = await resolveEmoji(name, customResolver);
      if (resolved) result[name] = resolved;
    }),
  );
  return result;
}
