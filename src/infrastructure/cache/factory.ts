import type { CacheStore } from "./store";
import { createMemoryCacheStore } from "./memory";

export type CacheBackend = "memory" | "valkey";

export interface CacheConfig {
  backend: CacheBackend;
  /** Required when `backend` is `"valkey"`. */
  valkeyUrl?: string;
}

/**
 * Build a `CacheConfig` from environment variables.
 *
 * | Variable        | Description                                | Default    |
 * |-----------------|--------------------------------------------|------------|
 * | `CACHE_BACKEND` | `"memory"` or `"valkey"`                   | `"memory"` |
 * | `VALKEY_URL`    | Valkey connection URL (required for valkey) | —          |
 */
export function cacheConfigFromEnv(): CacheConfig {
  const backend = (process.env.CACHE_BACKEND ?? "memory") as CacheBackend;
  if (backend !== "memory" && backend !== "valkey") {
    throw new Error(`Invalid CACHE_BACKEND: "${backend}". Must be "memory" or "valkey".`);
  }
  const valkeyUrl = process.env.VALKEY_URL;
  if (backend === "valkey" && !valkeyUrl) {
    throw new Error("VALKEY_URL is required when CACHE_BACKEND is valkey");
  }
  return { backend, valkeyUrl };
}

/**
 * Create a CacheStore from the given configuration.
 *
 * The Valkey module is loaded dynamically so that `iovalkey` is not required
 * at import time when using the in-memory backend.
 */
export async function createCacheStore(config: CacheConfig): Promise<CacheStore> {
  if (config.backend === "valkey") {
    const { createValkeyCacheStore } = await import("./valkey");
    return createValkeyCacheStore({ url: config.valkeyUrl! });
  }
  return createMemoryCacheStore();
}
