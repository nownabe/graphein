import { Redis } from "ioredis";
import type { CacheStore } from "./store";

export interface RedisCacheStoreOptions {
  /** Redis connection URL (e.g. `redis://localhost:6379`). */
  url: string;
  /** Optional key prefix to namespace all keys (default: `"graphein:"`). */
  keyPrefix?: string;
}

/**
 * Redis-backed cache store. Suitable for multi-instance deployments where
 * caches and rate-limit counters must be shared across processes.
 *
 * The returned promise resolves only after the initial connection succeeds,
 * so callers can catch startup failures synchronously. Runtime reconnection
 * errors are logged but not fatal (ioredis reconnects automatically).
 */
export async function createRedisCacheStore(options: RedisCacheStoreOptions): Promise<CacheStore> {
  const prefix = options.keyPrefix ?? "graphein:";
  const redis = new Redis(options.url, { lazyConnect: true, keyPrefix: prefix });

  // Log runtime connection errors (e.g. transient disconnects). ioredis will
  // attempt to reconnect automatically; attaching a handler prevents unhandled
  // rejection / uncaught exception crashes.
  redis.on("error", (err) => {
    console.error("[cache:redis] connection error", err);
  });

  // Await the initial connection so that startup fails fast on bad config.
  await redis.connect();

  return {
    async get(key) {
      const val = await redis.get(key);
      return val ?? undefined;
    },

    async set(key, value, ttlMs) {
      if (ttlMs != null) {
        await redis.set(key, value, "PX", ttlMs);
      } else {
        await redis.set(key, value);
      }
    },

    async delete(key) {
      await redis.del(key);
    },

    async increment(key, ttlMs) {
      const next = await redis.incr(key);
      // Set TTL only on first increment (when the counter was just created)
      if (next === 1 && ttlMs != null) {
        await redis.pexpire(key, ttlMs);
      }
      return next;
    },

    async close() {
      await redis.quit();
    },
  };
}
