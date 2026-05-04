import { z } from "@hono/zod-openapi";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { KudosService } from "../../application/kudos/service";
import {
  EmbeddedUserWithAvatarSchema,
  ErrorResponseSchema,
  UnauthorizedResponse,
  RateLimitedResponse,
} from "./schemas";

import {
  encodePageToken,
  decodePageToken,
  isValidIso8601,
  filterFingerprint,
  UUID_REGEX,
} from "../../domain/pagination";

// ---------------------------------------------------------------------------
// Shared Zod helpers
// ---------------------------------------------------------------------------

const iso8601String = z
  .string()
  .refine(isValidIso8601, { message: "Must be a valid ISO 8601 datetime string" });

const uuidString = z.string().regex(UUID_REGEX, { message: "Must be a valid UUID" });

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
  security: [{ bearerAuth: [] }],
  summary: "List kudos",
  description:
    "Returns kudos entries. All authenticated users can see all kudos. Supports filtering by sender, recipient, and time period.",
  request: { query: ListKudosQuerySchema },
  responses: {
    200: {
      description: "Paginated list of kudos entries.",
      content: { "application/json": { schema: ListKudosResponseSchema } },
    },
    401: UnauthorizedResponse,
    422: {
      description: "Validation error.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    429: RateLimitedResponse,
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

    // Decode keyset cursor
    let cursorPostedAt: Date | undefined;
    let cursorEntryId: string | undefined;
    if (query.pageToken) {
      const cursor = decodePageToken(query.pageToken);
      if (
        !cursor ||
        cursor.fp !== fp ||
        !cursor.id ||
        !isValidIso8601(cursor.v) ||
        !UUID_REGEX.test(cursor.id)
      ) {
        return c.json(
          { error: { code: "validation_error", message: "Invalid or mismatched pageToken." } },
          422,
        );
      }
      cursorPostedAt = new Date(cursor.v);
      cursorEntryId = cursor.id;
    }

    const { entries, total, hasNext } = await kudosService.listKudosEntries({
      postedById: query.postedBy,
      mentionedUserId: query.user,
      periodStart: query.periodStart ? new Date(query.periodStart) : undefined,
      periodEnd: query.periodEnd ? new Date(query.periodEnd) : undefined,
      limit: query.pageSize,
      cursorPostedAt,
      cursorEntryId,
    });

    const lastEntry = entries[entries.length - 1];
    const nextPageToken =
      hasNext && lastEntry
        ? encodePageToken({ fp, v: lastEntry.postedAt.toISOString(), id: lastEntry.entryId })
        : "";

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
