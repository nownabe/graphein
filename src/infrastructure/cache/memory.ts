import type { CacheStore } from "./store";

interface Entry {
  value: string;
  expiresAt: number | null; // epoch ms, null = no expiry
}

// Sweep expired entries every 60 seconds.
const SWEEP_INTERVAL_MS = 60_000;

/**
 * In-memory cache backed by a plain `Map`. Suitable for single-instance
 * deployments where no external dependencies are desired.
 *
 * A background sweep runs every 60 seconds to evict expired entries, ensuring
 * that one-shot keys (e.g. window-scoped rate-limit counters) do not leak.
 */
export function createMemoryCacheStore(): CacheStore {
  const data = new Map<string, Entry>();

  function isExpired(entry: Entry): boolean {
    return entry.expiresAt !== null && Date.now() >= entry.expiresAt;
  }

  // Periodic sweep to remove expired entries that are never re-read.
  const sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of data) {
      if (entry.expiresAt !== null && now >= entry.expiresAt) {
        data.delete(key);
      }
    }
  }, SWEEP_INTERVAL_MS);
  // Allow the process to exit even if the timer is pending.
  sweepTimer.unref();

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
      clearInterval(sweepTimer);
      data.clear();
    },
  };
}
