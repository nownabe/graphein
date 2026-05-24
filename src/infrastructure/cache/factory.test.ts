import { describe, test, expect, afterEach } from "bun:test";
import { cacheConfigFromEnv, createCacheStore } from "./factory";

describe("cacheConfigFromEnv", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env.CACHE_BACKEND = originalEnv.CACHE_BACKEND;
    process.env.VALKEY_URL = originalEnv.VALKEY_URL;
  });

  test("defaults to memory backend", () => {
    delete process.env.CACHE_BACKEND;
    const config = cacheConfigFromEnv();
    expect(config.backend).toBe("memory");
  });

  test("accepts valkey backend with VALKEY_URL", () => {
    process.env.CACHE_BACKEND = "valkey";
    process.env.VALKEY_URL = "redis://localhost:6379";
    const config = cacheConfigFromEnv();
    expect(config.backend).toBe("valkey");
    expect(config.valkeyUrl).toBe("redis://localhost:6379");
  });

  test("throws on invalid backend value", () => {
    process.env.CACHE_BACKEND = "memcached";
    expect(() => cacheConfigFromEnv()).toThrow("Invalid CACHE_BACKEND");
  });

  test("throws when valkey backend missing VALKEY_URL", () => {
    process.env.CACHE_BACKEND = "valkey";
    delete process.env.VALKEY_URL;
    expect(() => cacheConfigFromEnv()).toThrow("VALKEY_URL is required");
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
