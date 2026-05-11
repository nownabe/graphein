import { describe, test, expect, afterEach } from "bun:test";
import { cacheConfigFromEnv, createCacheStore } from "./factory";

describe("cacheConfigFromEnv", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env.CACHE_BACKEND = originalEnv.CACHE_BACKEND;
    process.env.REDIS_URL = originalEnv.REDIS_URL;
  });

  test("defaults to memory backend", () => {
    delete process.env.CACHE_BACKEND;
    const config = cacheConfigFromEnv();
    expect(config.backend).toBe("memory");
  });

  test("accepts redis backend with REDIS_URL", () => {
    process.env.CACHE_BACKEND = "redis";
    process.env.REDIS_URL = "redis://localhost:6379";
    const config = cacheConfigFromEnv();
    expect(config.backend).toBe("redis");
    expect(config.redisUrl).toBe("redis://localhost:6379");
  });

  test("throws on invalid backend value", () => {
    process.env.CACHE_BACKEND = "memcached";
    expect(() => cacheConfigFromEnv()).toThrow("Invalid CACHE_BACKEND");
  });

  test("throws when redis backend missing REDIS_URL", () => {
    process.env.CACHE_BACKEND = "redis";
    delete process.env.REDIS_URL;
    expect(() => cacheConfigFromEnv()).toThrow("REDIS_URL is required");
  });
});

describe("createCacheStore", () => {
  test("creates memory store", async () => {
    const store = await createCacheStore({ backend: "memory" });
    await store.set("k", "v");
    expect(await store.get("k")).toBe("v");
    await store.close();
  });
});
