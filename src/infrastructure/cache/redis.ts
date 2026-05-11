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
 */
export function createRedisCacheStore(options: RedisCacheStoreOptions): CacheStore {
  const prefix = options.keyPrefix ?? "graphein:";
  const redis = new Redis(options.url, { lazyConnect: true, keyPrefix: prefix });

  // Connect eagerly so connection errors surface early.
  const ready = redis.connect().catch((err) => {
    console.error("[cache:redis] connection error", err);
    throw err;
  });

  async function ensureReady() {
    await ready;
  }

  return {
    async get(key) {
      await ensureReady();
      const val = await redis.get(key);
      return val ?? undefined;
    },

    async set(key, value, ttlMs) {
      await ensureReady();
      if (ttlMs != null) {
        await redis.set(key, value, "PX", ttlMs);
      } else {
        await redis.set(key, value);
      }
    },

    async delete(key) {
      await ensureReady();
      await redis.del(key);
    },

    async increment(key, ttlMs) {
      await ensureReady();
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
