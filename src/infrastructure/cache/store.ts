// Common cache interface for key-value storage with optional TTL.
//
// Implementations: MemoryCacheStore (in-process Map), ValkeyCacheStore (shared Valkey).

export interface CacheStore {
  /** Get a value by key. Returns `undefined` on miss. */
  get(key: string): Promise<string | undefined>;

  /** Set a value with an optional TTL in milliseconds. */
  set(key: string, value: string, ttlMs?: number): Promise<void>;

  /** Delete a key. */
  delete(key: string): Promise<void>;

  /**
   * Atomic increment. Returns the new value after incrementing.
   * If the key does not exist it is initialized to 0 before incrementing.
   * When `ttlMs` is provided the expiry is set **only on creation** (first
   * increment that initialises the key).
   */
  increment(key: string, ttlMs?: number): Promise<number>;

  /** Gracefully close the underlying connection (no-op for in-memory). */
  close(): Promise<void>;
}
