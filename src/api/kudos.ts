import { z } from "@hono/zod-openapi";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { KudosService } from "../kudos/service";
import { EmbeddedUserWithAvatarSchema, ErrorResponseSchema } from "./schemas";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface PageCursor {
  /** Filter fingerprint to detect changed filters between pages. */
  fp: string;
  /** Cursor value — offset for kudos lists. */
  v: string;
}

function encodePageToken(cursor: PageCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodePageToken(token: string): PageCursor | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.fp !== "string" || typeof parsed.v !== "string") return null;
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

const iso8601String = z
  .string()
  .refine(isValidIso8601, { message: "Must be a valid ISO 8601 datetime string" });

const uuidString = z
  .string()
  .refine((v) => UUID_REGEX.test(v), { message: "Must be a valid UUID" });

/** Compute a stable fingerprint of the filter parameters (excluding pagination). */
function filterFingerprint(params: Record<string, string | undefined>): string {
  const sorted = Object.entries(params)
    .filter(([_, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return sorted;
}

// ---------------------------------------------------------------------------
// Zod schemas — request / response
// ---------------------------------------------------------------------------

const ListKudosQuerySchema = z
  .object({
    postedBy: uuidString.optional().openapi({
      description: "Filter by sender user ID.",
      example: "550e8400-e29b-41d4-a716-446655440000",
    }),
    user: uuidString.optional().openapi({
      description: "Filter by recipient (mentioned user) ID.",
      example: "550e8400-e29b-41d4-a716-446655440001",
    }),
    periodStart: iso8601String.optional().openapi({
      description: "Kudos posted at or after this ISO 8601 datetime.",
      example: "2026-04-01T00:00:00Z",
    }),
    periodEnd: iso8601String.optional().openapi({
      description: "Kudos posted before this ISO 8601 datetime.",
      example: "2026-04-30T00:00:00Z",
    }),
    pageSize: z
      .string()
      .optional()
      .transform((v) => {
        if (v === undefined || v === "") return 50;
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0) return NaN;
        if (n === 0) return 50;
        return Math.min(n, 100);
      })
      .pipe(z.number().int().min(1).max(100))
      .openapi({
        description: "Maximum number of results per page (default 50, max 100).",
        example: 50,
      }),
    pageToken: z.string().optional().openapi({
      description: "Opaque cursor from a previous response's nextPageToken.",
    }),
  })
  .openapi("ListKudosQuery");

const KudosEntrySchema = z
  .object({
    id: z.string().uuid().openapi({ description: "Kudos entry ID." }),
    message: z.string().openapi({
      description: "Kudos message content.",
      example: "Great work on the release! :tada:",
    }),
    postedBy: EmbeddedUserWithAvatarSchema,
    postedAt: z.string().openapi({
      description: "Time the kudos was posted (ISO 8601).",
      example: "2026-04-17T08:00:00Z",
    }),
    slackPermalink: z.string().nullable().openapi({
      description: "Link to the original Slack message.",
      example: "https://slack.com/archives/C1234/p1234567890",
    }),
  })
  .openapi("KudosEntry");

const ListKudosResponseSchema = z
  .object({
    kudos: z.array(KudosEntrySchema),
    totalSize: z.number().int().openapi({ description: "Total matching kudos entries." }),
    nextPageToken: z.string().openapi({
      description: "Cursor for the next page. Empty string indicates the last page.",
    }),
  })
  .openapi("ListKudosResponse");

// ---------------------------------------------------------------------------
// Route definition
// ---------------------------------------------------------------------------

const listKudosRoute = createRoute({
  method: "get",
  path: "/kudos",
  tags: ["Kudos"],
  summary: "List kudos",
  description:
    "Returns kudos entries. All authenticated users can see all kudos. Supports filtering by sender, recipient, and time period.",
  request: { query: ListKudosQuerySchema },
  responses: {
    200: {
      description: "Paginated list of kudos entries.",
      content: { "application/json": { schema: ListKudosResponseSchema } },
    },
    422: {
      description: "Validation error.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createKudosApiRoutes(deps: { kudosService: KudosService }) {
  const { kudosService } = deps;
  const app = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) {
        const firstIssue = result.error.issues[0];
        return c.json(
          {
            error: {
              code: "validation_error",
              message: firstIssue?.message ?? "Invalid request parameters.",
            },
          },
          422,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // GET /kudos — list kudos entries
  // -----------------------------------------------------------------------

  app.openapi(listKudosRoute, async (c) => {
    const query = c.req.valid("query");

    const fp = filterFingerprint({
      postedBy: query.postedBy,
      user: query.user,
      periodStart: query.periodStart,
      periodEnd: query.periodEnd,
    });

    // Decode cursor to get offset
    let offset = 0;
    if (query.pageToken) {
      const cursor = decodePageToken(query.pageToken);
      if (!cursor || cursor.fp !== fp) {
        return c.json(
          { error: { code: "validation_error", message: "Invalid or mismatched pageToken." } },
          422,
        );
      }
      const parsedOffset = Number(cursor.v);
      if (!Number.isInteger(parsedOffset) || parsedOffset < 0) {
        return c.json({ error: { code: "validation_error", message: "Invalid pageToken." } }, 422);
      }
      offset = parsedOffset;
    }

    const { entries, total } = await kudosService.listKudosEntries({
      postedById: query.postedBy,
      mentionedUserId: query.user,
      periodStart: query.periodStart ? new Date(query.periodStart) : undefined,
      periodEnd: query.periodEnd ? new Date(query.periodEnd) : undefined,
      limit: query.pageSize,
      offset,
    });

    const nextOffset = offset + entries.length;
    const hasNext = nextOffset < total;
    const nextPageToken = hasNext ? encodePageToken({ fp, v: String(nextOffset) }) : "";

    return c.json(
      {
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
      },
      200,
    );
  });

  return app;
}
