import type { CacheStore } from "./store";
import { createMemoryCacheStore } from "./memory";

export type CacheBackend = "memory" | "redis";

export interface CacheConfig {
  backend: CacheBackend;
  /** Required when `backend` is `"redis"`. */
  redisUrl?: string;
}

/**
 * Build a `CacheConfig` from environment variables.
 *
 * | Variable        | Description                              | Default    |
 * |-----------------|------------------------------------------|------------|
 * | `CACHE_BACKEND` | `"memory"` or `"redis"`                  | `"memory"` |
 * | `REDIS_URL`     | Redis connection URL (required for redis) | —          |
 */
export function cacheConfigFromEnv(): CacheConfig {
  const backend = (process.env.CACHE_BACKEND ?? "memory") as CacheBackend;
  if (backend !== "memory" && backend !== "redis") {
    throw new Error(`Invalid CACHE_BACKEND: "${backend}". Must be "memory" or "redis".`);
  }
  const redisUrl = process.env.REDIS_URL;
  if (backend === "redis" && !redisUrl) {
    throw new Error("REDIS_URL is required when CACHE_BACKEND is redis");
  }
  return { backend, redisUrl };
}

/**
 * Create a CacheStore from the given configuration.
 *
 * The Redis module is loaded dynamically so that `ioredis` is not required
 * at import time when using the in-memory backend.
 */
export async function createCacheStore(config: CacheConfig): Promise<CacheStore> {
  if (config.backend === "redis") {
    const { createRedisCacheStore } = await import("./redis");
    return createRedisCacheStore({ url: config.redisUrl! });
  }
  return createMemoryCacheStore();
}
