import { z } from "zod";
import { type SQL, and, eq, lt, gte, or, desc, inArray, count as drizzleCount } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "../../db/client";
import {
  snippets,
  snippetMentionedUsers,
  snippetMentionedUsergroups,
  users,
  usergroups,
} from "../../db/schema";
import type { McpContext } from "../types";

// ---------------------------------------------------------------------------
// Shared helpers (mirrored from src/api/snippets.ts)
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

function validateTimestampCursor(cursor: PageCursor): boolean {
  if (!isValidIso8601(cursor.v)) return false;
  if (cursor.id !== undefined && !UUID_REGEX.test(cursor.id)) return false;
  return true;
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

export interface SnippetToolsDeps {
  db: Database;
  getMcpContext: () => McpContext;
}

export function registerSnippetTools(server: McpServer, deps: SnippetToolsDeps): void {
  const { db } = deps;

  // -------------------------------------------------------------------------
  // list_snippets
  // -------------------------------------------------------------------------

  server.registerTool(
    "list_snippets",
    {
      description:
        "List snippets with optional filters. All authenticated users can see all snippets.",
      inputSchema: {
        postedBy: z.string().uuid().optional().describe("Filter by poster's user ID."),
        mentionedUser: z
          .string()
          .uuid()
          .optional()
          .describe("Filter by mentioned user ID. Combined with mentionedUsergroup using OR."),
        mentionedUsergroup: z
          .string()
          .uuid()
          .optional()
          .describe("Filter by mentioned usergroup ID. Combined with mentionedUser using OR."),
        periodStart: z
          .string()
          .optional()
          .describe("Snippets posted at or after this ISO 8601 datetime."),
        periodEnd: z.string().optional().describe("Snippets posted before this ISO 8601 datetime."),
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
    async ({
      postedBy,
      mentionedUser,
      mentionedUsergroup,
      periodStart,
      periodEnd,
      pageSize,
      pageToken,
    }) => {
      // Validate datetime filters
      if (periodStart && !isValidIso8601(periodStart)) {
        return errorResult("validation_error", "periodStart must be a valid ISO 8601 datetime.");
      }
      if (periodEnd && !isValidIso8601(periodEnd)) {
        return errorResult("validation_error", "periodEnd must be a valid ISO 8601 datetime.");
      }

      const fp = filterFingerprint({
        postedBy,
        mentionedUser,
        mentionedUsergroup,
        periodStart,
        periodEnd,
      });

      // Decode cursor
      let cursorCondition: SQL | undefined;
      if (pageToken) {
        const cursor = decodePageToken(pageToken);
        if (!cursor || cursor.fp !== fp || !cursor.id || !validateTimestampCursor(cursor)) {
          return errorResult("validation_error", "Invalid or mismatched pageToken.");
        }
        const cursorTime = new Date(cursor.v);
        cursorCondition = or(
          lt(snippets.postedAt, cursorTime),
          and(eq(snippets.postedAt, cursorTime), lt(snippets.id, cursor.id)),
        );
      }

      // Build filter conditions
      const filterConditions: SQL[] = [];

      if (postedBy) {
        filterConditions.push(eq(snippets.postedById, postedBy));
      }
      if (periodStart) {
        filterConditions.push(gte(snippets.postedAt, new Date(periodStart)));
      }
      if (periodEnd) {
        filterConditions.push(lt(snippets.postedAt, new Date(periodEnd)));
      }

      // mentionedUser and mentionedUsergroup are combined with OR
      const mentionConditions: SQL[] = [];
      if (mentionedUser) {
        const mentionedSnippetIds = db
          .select({ snippetId: snippetMentionedUsers.snippetId })
          .from(snippetMentionedUsers)
          .where(eq(snippetMentionedUsers.userId, mentionedUser));
        mentionConditions.push(inArray(snippets.id, mentionedSnippetIds));
      }
      if (mentionedUsergroup) {
        const mentionedSnippetIds = db
          .select({ snippetId: snippetMentionedUsergroups.snippetId })
          .from(snippetMentionedUsergroups)
          .where(eq(snippetMentionedUsergroups.usergroupId, mentionedUsergroup));
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
        .limit(pageSize + 1);

      const hasNext = rows.length > pageSize;
      const page = hasNext ? rows.slice(0, pageSize) : rows;

      // Fetch mentions for all snippets in the page
      const snippetIds = page.map((r) => r.id);

      let mentionedUsersMap = new Map<string, { id: string; displayName: string }[]>();
      let mentionedGroupsMap = new Map<
        string,
        { id: string; name: string; handle: string | null }[]
      >();

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
          list.push({ id: row.usergroupId, name: row.name, handle: row.handle });
          mentionedGroupsMap.set(row.snippetId, list);
        }
      }

      const lastRow = page[page.length - 1];
      const nextPageToken =
        hasNext && lastRow
          ? encodePageToken({ fp, v: lastRow.postedAt.toISOString(), id: lastRow.id })
          : "";

      return jsonResult({
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
      });
    },
  );
}
