import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { KudosService } from "../../kudos/service";
import type { McpContext } from "../types";

// ---------------------------------------------------------------------------
// Shared helpers (mirrored from src/api/kudos.ts)
// ---------------------------------------------------------------------------

interface PageCursor {
  fp: string;
  v: string;
  id?: string;
}

function encodePageToken(cursor: PageCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodePageToken(token: string): PageCursor | null {
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function isValidIso8601(value: string): boolean {
  if (!ISO_8601_REGEX.test(value)) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function filterFingerprint(params: Record<string, string | undefined>): string {
  const sorted = Object.entries(params)
    .filter(([_, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return sorted;
}

function errorResult(code: string, message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: { code, message } }) }],
    isError: true,
  };
}

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
  };
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export interface KudosToolsDeps {
  kudosService: KudosService;
  getMcpContext: () => McpContext;
}

export function registerKudosTools(server: McpServer, deps: KudosToolsDeps): void {
  const { kudosService } = deps;

  // -------------------------------------------------------------------------
  // list_kudos
  // -------------------------------------------------------------------------

  server.registerTool(
    "list_kudos",
    {
      description:
        "List kudos entries with optional filters. All authenticated users can see all kudos.",
      inputSchema: {
        postedBy: z.string().uuid().optional().describe("Filter by sender user ID."),
        user: z.string().uuid().optional().describe("Filter by recipient (mentioned user) ID."),
        periodStart: z
          .string()
          .optional()
          .describe("Kudos posted at or after this ISO 8601 datetime."),
        periodEnd: z
          .string()
          .optional()
          .describe("Kudos posted before this ISO 8601 datetime."),
        pageSize: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(50)
          .describe("Max results (default 50, max 100)."),
        pageToken: z.string().optional().describe("Cursor for next page."),
      },
    },
    async ({ postedBy, user, periodStart, periodEnd, pageSize, pageToken }) => {
      // Validate datetime filters
      if (periodStart && !isValidIso8601(periodStart)) {
        return errorResult("validation_error", "periodStart must be a valid ISO 8601 datetime.");
      }
      if (periodEnd && !isValidIso8601(periodEnd)) {
        return errorResult("validation_error", "periodEnd must be a valid ISO 8601 datetime.");
      }

      const fp = filterFingerprint({
        postedBy,
        user,
        periodStart,
        periodEnd,
      });

      // Decode keyset cursor
      let cursorPostedAt: Date | undefined;
      let cursorEntryId: string | undefined;
      if (pageToken) {
        const cursor = decodePageToken(pageToken);
        if (
          !cursor ||
          cursor.fp !== fp ||
          !cursor.id ||
          !isValidIso8601(cursor.v) ||
          !UUID_REGEX.test(cursor.id)
        ) {
          return errorResult("validation_error", "Invalid or mismatched pageToken.");
        }
        cursorPostedAt = new Date(cursor.v);
        cursorEntryId = cursor.id;
      }

      const { entries, total, hasNext } = await kudosService.listKudosEntries({
        postedById: postedBy,
        mentionedUserId: user,
        periodStart: periodStart ? new Date(periodStart) : undefined,
        periodEnd: periodEnd ? new Date(periodEnd) : undefined,
        limit: pageSize,
        cursorPostedAt,
        cursorEntryId,
      });

      const lastEntry = entries[entries.length - 1];
      const nextPageToken =
        hasNext && lastEntry
          ? encodePageToken({ fp, v: lastEntry.postedAt.toISOString(), id: lastEntry.entryId })
          : "";

      return jsonResult({
        kudos: entries.map((entry) => ({
          id: entry.entryId,
          message: entry.message,
          postedBy: {
            id: entry.poster.id,
            displayName: entry.poster.displayName,
            avatarUrl: entry.poster.avatarUrl,
          },
          postedAt: entry.postedAt.toISOString(),
          slackPermalink: entry.slackPermalink,
        })),
        totalSize: total,
        nextPageToken,
      });
    },
  );
}
