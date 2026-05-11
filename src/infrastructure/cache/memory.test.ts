import { describe, test, expect, beforeEach } from "bun:test";
import { createMemoryCacheStore } from "./memory";
import type { CacheStore } from "./store";

describe("MemoryCacheStore", () => {
  let cache: CacheStore;

  beforeEach(() => {
    cache = createMemoryCacheStore();
  });

  // -------------------------------------------------------------------
  // get / set
  // -------------------------------------------------------------------

  test("returns undefined for missing key", async () => {
    expect(await cache.get("missing")).toBeUndefined();
  });

  test("stores and retrieves a value", async () => {
    await cache.set("key", "value");
    expect(await cache.get("key")).toBe("value");
  });

  test("overwrites existing value", async () => {
    await cache.set("key", "v1");
    await cache.set("key", "v2");
    expect(await cache.get("key")).toBe("v2");
  });

  test("expires entries after TTL", async () => {
    await cache.set("key", "value", 1); // 1ms TTL
    // Wait for expiry
    await new Promise((r) => setTimeout(r, 5));
    expect(await cache.get("key")).toBeUndefined();
  });

  test("entry without TTL does not expire", async () => {
    await cache.set("key", "value");
    // No TTL means it persists
    expect(await cache.get("key")).toBe("value");
  });

  // -------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------

  test("deletes a key", async () => {
    await cache.set("key", "value");
    await cache.delete("key");
    expect(await cache.get("key")).toBeUndefined();
  });

  test("delete on missing key is a no-op", async () => {
    await cache.delete("missing"); // should not throw
  });

  // -------------------------------------------------------------------
  // increment
  // -------------------------------------------------------------------

  test("increment initialises to 1 on missing key", async () => {
    expect(await cache.increment("counter")).toBe(1);
  });

  test("increment increases value", async () => {
    await cache.increment("counter");
    expect(await cache.increment("counter")).toBe(2);
    expect(await cache.increment("counter")).toBe(3);
  });

  test("increment with TTL expires the counter", async () => {
    await cache.increment("counter", 1); // 1ms TTL
    await new Promise((r) => setTimeout(r, 5));
    // After expiry, should re-initialise to 1
    expect(await cache.increment("counter")).toBe(1);
  });

  test("increment does not reset TTL on subsequent calls", async () => {
    await cache.increment("counter", 50); // 50ms TTL
    await new Promise((r) => setTimeout(r, 20));
    // Second increment should NOT extend the TTL
    expect(await cache.increment("counter", 50)).toBe(2);
    // Wait for original TTL to expire (50ms from first call)
    await new Promise((r) => setTimeout(r, 35));
    expect(await cache.increment("counter")).toBe(1);
  });

  // -------------------------------------------------------------------
  // close
  // -------------------------------------------------------------------

  test("close clears all entries", async () => {
    await cache.set("a", "1");
    await cache.set("b", "2");
    await cache.close();
    expect(await cache.get("a")).toBeUndefined();
    expect(await cache.get("b")).toBeUndefined();
  });
});
