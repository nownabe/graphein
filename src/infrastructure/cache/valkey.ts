import Valkey from "iovalkey";
import type { CacheStore } from "./store";

export interface ValkeyCacheStoreOptions {
  /** Valkey connection URL (e.g. `redis://localhost:6379`). */
  url: string;
  /** Optional key prefix to namespace all keys (default: `"graphein:"`). */
  keyPrefix?: string;
}

/**
 * Valkey-backed cache store. Suitable for multi-instance deployments where
 * caches and rate-limit counters must be shared across processes.
 *
 * The returned promise resolves only after the initial connection succeeds,
 * so callers can catch startup failures synchronously. Runtime reconnection
 * errors are logged but not fatal (iovalkey reconnects automatically).
 */
export async function createValkeyCacheStore(options: ValkeyCacheStoreOptions): Promise<CacheStore> {
  const prefix = options.keyPrefix ?? "graphein:";
  const valkey = new Valkey(options.url, { lazyConnect: true, keyPrefix: prefix });

  // Log runtime connection errors (e.g. transient disconnects). iovalkey will
  // attempt to reconnect automatically; attaching a handler prevents unhandled
  // rejection / uncaught exception crashes.
  valkey.on("error", (err) => {
    console.error("[cache:valkey] connection error", err);
  });

  // Await the initial connection so that startup fails fast on bad config.
  await valkey.connect();

  return {
    async get(key) {
      const val = await valkey.get(key);
      return val ?? undefined;
    },

    async set(key, value, ttlMs) {
      if (ttlMs != null) {
        await valkey.set(key, value, "PX", ttlMs);
      } else {
        await valkey.set(key, value);
      }
    },

    async delete(key) {
      await valkey.del(key);
    },

    async increment(key, ttlMs) {
      const next = await valkey.incr(key);
      // Set TTL only on first increment (when the counter was just created)
      if (next === 1 && ttlMs != null) {
        await valkey.pexpire(key, ttlMs);
      }
      return next;
    },

    async close() {
      await valkey.quit();
    },
  };
}
