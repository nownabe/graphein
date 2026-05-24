import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createValkeyCacheStore } from "./valkey";
import type { CacheStore } from "./store";

const TEST_VALKEY_URL = process.env.TEST_VALKEY_URL ?? "redis://localhost:16379/1";

describe("ValkeyCacheStore", () => {
  let cache: CacheStore;

  beforeEach(async () => {
    cache = await createValkeyCacheStore({
      url: TEST_VALKEY_URL,
      keyPrefix: `graphein:test:${crypto.randomUUID()}:`,
    });
  });

  afterEach(async () => {
    await cache?.close();
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
    await cache.set("key", "value", 50); // 50ms TTL
    // Wait for expiry
    await new Promise((r) => setTimeout(r, 100));
    expect(await cache.get("key")).toBeUndefined();
  });

  test("entry without TTL does not expire", async () => {
    await cache.set("key", "value");
    await new Promise((r) => setTimeout(r, 50));
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
    await cache.increment("counter", 50); // 50ms TTL
    await new Promise((r) => setTimeout(r, 100));
    // After expiry, should re-initialise to 1
    expect(await cache.increment("counter")).toBe(1);
  });

  test("increment sets TTL only on first call", async () => {
    await cache.increment("counter", 200); // 200ms TTL
    await new Promise((r) => setTimeout(r, 50));
    // Second increment should NOT extend the TTL
    await cache.increment("counter", 200);
    // Wait for the original TTL to expire
    await new Promise((r) => setTimeout(r, 200));
    expect(await cache.increment("counter")).toBe(1);
  });
});
