/**
 * Transport-independent pagination, cursor encoding, filter fingerprinting,
 * and validation helpers shared by API and MCP entrypoints.
 */

export interface PageCursor {
  /** Filter fingerprint to detect changed filters between pages. */
  fp: string;
  /** Cursor value — typically an ISO 8601 timestamp or UUID. */
  v: string;
  /** Secondary cursor (e.g. record ID) for tie-breaking. */
  id?: string;
}

export function encodePageToken(cursor: PageCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodePageToken(token: string): PageCursor | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.fp !== "string" || typeof parsed.v !== "string") return null;
    if (parsed.id !== undefined && typeof parsed.id !== "string") return null;
    return parsed as PageCursor;
  } catch {
    return null;
  }
}

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function isValidIso8601(value: string): boolean {
  if (!ISO_8601_REGEX.test(value)) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

/** Validate that cursor.v is a valid ISO 8601 timestamp and cursor.id is a valid UUID. */
export function validateTimestampCursor(cursor: PageCursor): boolean {
  if (!isValidIso8601(cursor.v)) return false;
  if (cursor.id !== undefined && !UUID_REGEX.test(cursor.id)) return false;
  return true;
}

/** Compute a stable fingerprint of the filter parameters (excluding pagination). */
export function filterFingerprint(params: Record<string, string | undefined>): string {
  const sorted = Object.entries(params)
    .filter(([_, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return sorted;
}
