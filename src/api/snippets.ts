import { z } from "@hono/zod-openapi";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { SnippetService } from "../snippets/service";
import {
  ErrorResponseSchema,
  EmbeddedUserWithAvatarSchema,
  EmbeddedUserSchema,
  EmbeddedUsergroupSchema,
  UnauthorizedResponse,
  RateLimitedResponse,
} from "./schemas";

import {
  encodePageToken,
  decodePageToken,
  isValidIso8601,
  validateTimestampCursor,
  filterFingerprint,
  UUID_REGEX,
} from "../pagination";

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

const ListSnippetsQuerySchema = z
  .object({
    postedBy: uuidString.optional().openapi({
      description: "Filter by poster's user ID.",
      example: "550e8400-e29b-41d4-a716-446655440000",
    }),
    mentionedUser: uuidString.optional().openapi({
      description: "Filter by mentioned user ID. Combined with mentionedUsergroup using OR.",
      example: "550e8400-e29b-41d4-a716-446655440000",
    }),
    mentionedUsergroup: uuidString.optional().openapi({
      description: "Filter by mentioned usergroup ID. Combined with mentionedUser using OR.",
      example: "660e8400-e29b-41d4-a716-446655440000",
    }),
    periodStart: iso8601String.optional().openapi({
      description: "Snippets posted at or after this ISO 8601 datetime.",
      example: "2026-04-01T00:00:00Z",
    }),
    periodEnd: iso8601String.optional().openapi({
      description: "Snippets posted before this ISO 8601 datetime.",
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
  .openapi("ListSnippetsQuery");

const SnippetSchema = z
  .object({
    id: z.string().uuid().openapi({ description: "Snippet ID." }),
    content: z.string().openapi({ description: "Snippet content text." }),
    postedAt: z.string().openapi({ description: "Time the snippet was posted (ISO 8601)." }),
    slackPermalink: z
      .string()
      .nullable()
      .openapi({ description: "Link to the original Slack message." }),
    postedBy: EmbeddedUserWithAvatarSchema,
    mentionedUsers: z.array(EmbeddedUserSchema).openapi({
      description: "Users mentioned in the snippet.",
    }),
    mentionedUsergroups: z.array(EmbeddedUsergroupSchema).openapi({
      description: "Usergroups mentioned in the snippet.",
    }),
  })
  .openapi("Snippet");

const ListSnippetsResponseSchema = z
  .object({
    snippets: z.array(SnippetSchema),
    totalSize: z.number().int().openapi({ description: "Total matching snippets." }),
    nextPageToken: z.string().openapi({ description: "Cursor for the next page." }),
  })
  .openapi("ListSnippetsResponse");

// ---------------------------------------------------------------------------
// Route definition
// ---------------------------------------------------------------------------

const listSnippetsRoute = createRoute({
  method: "get",
  path: "/snippets",
  tags: ["Snippets"],
  security: [{ bearerAuth: [] }],
  summary: "List snippets",
  description:
    "Returns snippets accessible to all authenticated users. Supports filtering by poster, mentioned users/usergroups, and time period.",
  request: { query: ListSnippetsQuerySchema },
  responses: {
    200: {
      description: "Paginated list of snippets.",
      content: { "application/json": { schema: ListSnippetsResponseSchema } },
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

export function createSnippetApiRoutes(deps: { snippetService: SnippetService }) {
  const { snippetService } = deps;
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
  // GET /snippets — list snippets
  // -----------------------------------------------------------------------

  app.openapi(listSnippetsRoute, async (c) => {
    const query = c.req.valid("query");

    const fp = filterFingerprint({
      postedBy: query.postedBy,
      mentionedUser: query.mentionedUser,
      mentionedUsergroup: query.mentionedUsergroup,
      periodStart: query.periodStart,
      periodEnd: query.periodEnd,
    });

    // Decode cursor
    let cursor: { postedAt: Date; id: string } | undefined;
    if (query.pageToken) {
      const decoded = decodePageToken(query.pageToken);
      if (!decoded || decoded.fp !== fp || !decoded.id || !validateTimestampCursor(decoded)) {
        return c.json(
          { error: { code: "validation_error", message: "Invalid or mismatched pageToken." } },
          422,
        );
      }
      cursor = { postedAt: new Date(decoded.v), id: decoded.id };
    }

    const result = await snippetService.listSnippetsKeyset(
      {
        postedById: query.postedBy,
        mentionedUserIds: query.mentionedUser ? [query.mentionedUser] : undefined,
        mentionedUsergroupIds: query.mentionedUsergroup ? [query.mentionedUsergroup] : undefined,
        periodStart: query.periodStart ? new Date(query.periodStart) : undefined,
        periodEnd: query.periodEnd ? new Date(query.periodEnd) : undefined,
      },
      { pageSize: query.pageSize, cursor },
    );

    const lastSnippet = result.snippets[result.snippets.length - 1];
    const nextPageToken =
      result.hasNextPage && lastSnippet
        ? encodePageToken({
            fp,
            v: lastSnippet.postedAt.toISOString(),
            id: lastSnippet.id,
          })
        : "";

    return c.json(
      {
        snippets: result.snippets.map((s) => ({
          id: s.id,
          content: s.content,
          postedAt: s.postedAt.toISOString(),
          slackPermalink: s.slackPermalink,
          postedBy: s.poster,
          mentionedUsers: s.mentionedUsers,
          mentionedUsergroups: s.mentionedUsergroups,
        })),
        totalSize: result.total,
        nextPageToken,
      },
      200,
    );
  });

  return app;
}
