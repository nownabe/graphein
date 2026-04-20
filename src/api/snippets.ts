import { z } from "@hono/zod-openapi";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  type SQL,
  and,
  eq,
  lt,
  gte,
  or,
  desc,
  inArray,
  count as drizzleCount,
} from "drizzle-orm";
import type { Database } from "../db/client";
import {
  snippets,
  snippetMentionedUsers,
  snippetMentionedUsergroups,
  users,
  usergroups,
} from "../db/schema";
import {
  ErrorResponseSchema,
  EmbeddedUserWithAvatarSchema,
  EmbeddedUserSchema,
  EmbeddedUsergroupSchema,
} from "./schemas";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface PageCursor {
  /** Filter fingerprint to detect changed filters between pages. */
  fp: string;
  /** Cursor value — ISO 8601 timestamp for snippet lists. */
  v: string;
  /** Secondary cursor (snippet ID) for tie-breaking. */
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

/** Validate that cursor.v is a valid ISO 8601 timestamp and cursor.id is a valid UUID. */
function validateTimestampCursor(cursor: PageCursor): boolean {
  if (!isValidIso8601(cursor.v)) return false;
  if (cursor.id !== undefined && !UUID_REGEX.test(cursor.id)) return false;
  return true;
}

/** Compute a stable fingerprint of the filter parameters (excluding pagination). */
function filterFingerprint(params: Record<string, string | undefined>): string {
  const sorted = Object.entries(params)
    .filter(([_, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return sorted;
}

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
  summary: "List snippets",
  description:
    "Returns snippets accessible to all authenticated users. Supports filtering by poster, mentioned users/usergroups, and time period.",
  request: { query: ListSnippetsQuerySchema },
  responses: {
    200: {
      description: "Paginated list of snippets.",
      content: { "application/json": { schema: ListSnippetsResponseSchema } },
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

export function createSnippetApiRoutes(deps: { db: Database }) {
  const { db } = deps;
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
    let cursorCondition: SQL | undefined;
    if (query.pageToken) {
      const cursor = decodePageToken(query.pageToken);
      if (!cursor || cursor.fp !== fp || !cursor.id || !validateTimestampCursor(cursor)) {
        return c.json(
          { error: { code: "validation_error", message: "Invalid or mismatched pageToken." } },
          422,
        );
      }
      const cursorTime = new Date(cursor.v);
      // Keyset: (postedAt, id) < (cursorTime, cursorId)
      cursorCondition = or(
        lt(snippets.postedAt, cursorTime),
        and(eq(snippets.postedAt, cursorTime), lt(snippets.id, cursor.id)),
      );
    }

    // Build filter conditions (without cursor)
    const filterConditions: SQL[] = [];

    if (query.postedBy) {
      filterConditions.push(eq(snippets.postedById, query.postedBy));
    }
    if (query.periodStart) {
      filterConditions.push(gte(snippets.postedAt, new Date(query.periodStart)));
    }
    if (query.periodEnd) {
      filterConditions.push(lt(snippets.postedAt, new Date(query.periodEnd)));
    }

    // mentionedUser and mentionedUsergroup are combined with OR
    const mentionConditions: SQL[] = [];
    if (query.mentionedUser) {
      const mentionedSnippetIds = db
        .select({ snippetId: snippetMentionedUsers.snippetId })
        .from(snippetMentionedUsers)
        .where(eq(snippetMentionedUsers.userId, query.mentionedUser));
      mentionConditions.push(inArray(snippets.id, mentionedSnippetIds));
    }
    if (query.mentionedUsergroup) {
      const mentionedSnippetIds = db
        .select({ snippetId: snippetMentionedUsergroups.snippetId })
        .from(snippetMentionedUsergroups)
        .where(eq(snippetMentionedUsergroups.usergroupId, query.mentionedUsergroup));
      mentionConditions.push(inArray(snippets.id, mentionedSnippetIds));
    }
    if (mentionConditions.length > 0) {
      filterConditions.push(
        mentionConditions.length === 1 ? mentionConditions[0] : or(...mentionConditions)!,
      );
    }

    const where = filterConditions.length > 0 ? and(...filterConditions) : undefined;

    // Count total
    const [{ total }] = await db.select({ total: drizzleCount() }).from(snippets).where(where);

    // Fetch page with cursor
    const allConditions = cursorCondition
      ? [...filterConditions, cursorCondition]
      : filterConditions;
    const allWhere = allConditions.length > 0 ? and(...allConditions) : undefined;

    const rows = await db
      .select({
        id: snippets.id,
        content: snippets.content,
        postedAt: snippets.postedAt,
        slackPermalink: snippets.slackPermalink,
        postedById: snippets.postedById,
        posterDisplayName: users.displayName,
        posterAvatarUrl: users.avatarUrl,
      })
      .from(snippets)
      .innerJoin(users, eq(snippets.postedById, users.id))
      .where(allWhere)
      .orderBy(desc(snippets.postedAt), desc(snippets.id))
      .limit(query.pageSize + 1);

    const hasNext = rows.length > query.pageSize;
    const page = hasNext ? rows.slice(0, query.pageSize) : rows;

    // Fetch mentions for all snippets in the page
    const snippetIds = page.map((r) => r.id);

    let mentionedUsersMap = new Map<string, { id: string; displayName: string }[]>();
    let mentionedGroupsMap = new Map<string, { id: string; name: string; handle: string }[]>();

    if (snippetIds.length > 0) {
      const mentionedUsersRows = await db
        .select({
          snippetId: snippetMentionedUsers.snippetId,
          userId: snippetMentionedUsers.userId,
          displayName: users.displayName,
        })
        .from(snippetMentionedUsers)
        .innerJoin(users, eq(snippetMentionedUsers.userId, users.id))
        .where(inArray(snippetMentionedUsers.snippetId, snippetIds));

      for (const row of mentionedUsersRows) {
        const list = mentionedUsersMap.get(row.snippetId) ?? [];
        list.push({ id: row.userId, displayName: row.displayName });
        mentionedUsersMap.set(row.snippetId, list);
      }

      const mentionedGroupsRows = await db
        .select({
          snippetId: snippetMentionedUsergroups.snippetId,
          usergroupId: snippetMentionedUsergroups.usergroupId,
          name: usergroups.name,
          handle: usergroups.handle,
        })
        .from(snippetMentionedUsergroups)
        .innerJoin(usergroups, eq(snippetMentionedUsergroups.usergroupId, usergroups.id))
        .where(inArray(snippetMentionedUsergroups.snippetId, snippetIds));

      for (const row of mentionedGroupsRows) {
        const list = mentionedGroupsMap.get(row.snippetId) ?? [];
        list.push({ id: row.usergroupId, name: row.name, handle: row.handle ?? "" });
        mentionedGroupsMap.set(row.snippetId, list);
      }
    }

    const lastRow = page[page.length - 1];
    const nextPageToken =
      hasNext && lastRow
        ? encodePageToken({
            fp,
            v: lastRow.postedAt.toISOString(),
            id: lastRow.id,
          })
        : "";

    return c.json(
      {
        snippets: page.map((r) => ({
          id: r.id,
          content: r.content,
          postedAt: r.postedAt.toISOString(),
          slackPermalink: r.slackPermalink,
          postedBy: {
            id: r.postedById,
            displayName: r.posterDisplayName,
            avatarUrl: r.posterAvatarUrl,
          },
          mentionedUsers: mentionedUsersMap.get(r.id) ?? [],
          mentionedUsergroups: mentionedGroupsMap.get(r.id) ?? [],
        })),
        totalSize: total,
        nextPageToken,
      },
      200,
    );
  });

  return app;
}
