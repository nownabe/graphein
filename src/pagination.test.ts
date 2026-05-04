import { describe, expect, it } from "bun:test";
import {
  type PageCursor,
  encodePageToken,
  decodePageToken,
  isValidIso8601,
  validateTimestampCursor,
  filterFingerprint,
  UUID_REGEX,
} from "./pagination";

// ---------------------------------------------------------------------------
// encodePageToken / decodePageToken
// ---------------------------------------------------------------------------

describe("encodePageToken / decodePageToken", () => {
  it("round-trips a cursor with all fields", () => {
    const cursor: PageCursor = {
      fp: "status=open",
      v: "2026-01-15T10:00:00Z",
      id: "550e8400-e29b-41d4-a716-446655440000",
    };
    const token = encodePageToken(cursor);
    expect(decodePageToken(token)).toEqual(cursor);
  });

  it("round-trips a cursor without optional id", () => {
    const cursor: PageCursor = { fp: "", v: "2026-01-15T10:00:00Z" };
    const token = encodePageToken(cursor);
    expect(decodePageToken(token)).toEqual(cursor);
  });

  it("returns null for non-base64 input", () => {
    expect(decodePageToken("not-valid-base64!!!")).toBeNull();
  });

  it("returns null for valid base64 but invalid JSON", () => {
    const token = Buffer.from("not json").toString("base64url");
    expect(decodePageToken(token)).toBeNull();
  });

  it("returns null when fp is missing", () => {
    const token = Buffer.from(JSON.stringify({ v: "x" })).toString("base64url");
    expect(decodePageToken(token)).toBeNull();
  });

  it("returns null when v is missing", () => {
    const token = Buffer.from(JSON.stringify({ fp: "x" })).toString("base64url");
    expect(decodePageToken(token)).toBeNull();
  });

  it("returns null when id is not a string", () => {
    const token = Buffer.from(JSON.stringify({ fp: "x", v: "y", id: 123 })).toString("base64url");
    expect(decodePageToken(token)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isValidIso8601
// ---------------------------------------------------------------------------

describe("isValidIso8601", () => {
  it("accepts a valid UTC timestamp", () => {
    expect(isValidIso8601("2026-01-15T10:00:00Z")).toBe(true);
  });

  it("accepts a timestamp with positive offset", () => {
    expect(isValidIso8601("2026-01-15T19:00:00+09:00")).toBe(true);
  });

  it("accepts a timestamp with fractional seconds", () => {
    expect(isValidIso8601("2026-01-15T10:00:00.123Z")).toBe(true);
  });

  it("rejects a date-only string", () => {
    expect(isValidIso8601("2026-01-15")).toBe(false);
  });

  it("accepts Feb 30 (Date constructor normalizes it)", () => {
    // JavaScript's Date normalizes Feb 30 → Mar 2, so it parses without NaN.
    expect(isValidIso8601("2026-02-30T00:00:00Z")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidIso8601("")).toBe(false);
  });

  it("rejects random text", () => {
    expect(isValidIso8601("not-a-date")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UUID_REGEX
// ---------------------------------------------------------------------------

describe("UUID_REGEX", () => {
  it("matches a valid lowercase UUID", () => {
    expect(UUID_REGEX.test("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("matches a valid uppercase UUID", () => {
    expect(UUID_REGEX.test("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
  });

  it("rejects a short string", () => {
    expect(UUID_REGEX.test("550e8400")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(UUID_REGEX.test("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateTimestampCursor
// ---------------------------------------------------------------------------

describe("validateTimestampCursor", () => {
  it("accepts a valid cursor with timestamp and UUID", () => {
    expect(
      validateTimestampCursor({
        fp: "",
        v: "2026-01-15T10:00:00Z",
        id: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).toBe(true);
  });

  it("accepts a valid cursor without id", () => {
    expect(validateTimestampCursor({ fp: "", v: "2026-01-15T10:00:00Z" })).toBe(true);
  });

  it("rejects an invalid timestamp in v", () => {
    expect(validateTimestampCursor({ fp: "", v: "not-a-date" })).toBe(false);
  });

  it("rejects an invalid UUID in id", () => {
    expect(validateTimestampCursor({ fp: "", v: "2026-01-15T10:00:00Z", id: "bad-uuid" })).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// filterFingerprint
// ---------------------------------------------------------------------------

describe("filterFingerprint", () => {
  it("produces a stable sorted fingerprint", () => {
    expect(filterFingerprint({ b: "2", a: "1" })).toBe("a=1&b=2");
  });

  it("excludes undefined values", () => {
    expect(filterFingerprint({ a: "1", b: undefined, c: "3" })).toBe("a=1&c=3");
  });

  it("returns empty string for all-undefined params", () => {
    expect(filterFingerprint({ a: undefined })).toBe("");
  });

  it("returns empty string for empty params", () => {
    expect(filterFingerprint({})).toBe("");
  });

  it("is stable regardless of insertion order", () => {
    const fp1 = filterFingerprint({ z: "last", a: "first", m: "middle" });
    const fp2 = filterFingerprint({ a: "first", m: "middle", z: "last" });
    expect(fp1).toBe(fp2);
  });
});
