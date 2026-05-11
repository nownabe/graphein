import type { CacheStore } from "./store";

interface Entry {
  value: string;
  expiresAt: number | null; // epoch ms, null = no expiry
}

/**
 * In-memory cache backed by a plain `Map`. Suitable for single-instance
 * deployments where no external dependencies are desired.
 */
export function createMemoryCacheStore(): CacheStore {
  const data = new Map<string, Entry>();

  function isExpired(entry: Entry): boolean {
    return entry.expiresAt !== null && Date.now() >= entry.expiresAt;
  }

  return {
    async get(key) {
      const entry = data.get(key);
      if (!entry) return undefined;
      if (isExpired(entry)) {
        data.delete(key);
        return undefined;
      }
      return entry.value;
    },

    async set(key, value, ttlMs) {
      const expiresAt = ttlMs != null ? Date.now() + ttlMs : null;
      data.set(key, { value, expiresAt });
    },

    async delete(key) {
      data.delete(key);
    },

    async increment(key, ttlMs) {
      const entry = data.get(key);
      if (!entry || isExpired(entry)) {
        const expiresAt = ttlMs != null ? Date.now() + ttlMs : null;
        data.set(key, { value: "1", expiresAt });
        return 1;
      }
      const next = Number(entry.value) + 1;
      entry.value = String(next);
      return next;
    },

    async close() {
      data.clear();
    },
  };
}
