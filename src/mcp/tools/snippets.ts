import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SnippetService } from "../../snippets/service";
import type { McpContext } from "../types";

import {
  encodePageToken,
  decodePageToken,
  isValidIso8601,
  validateTimestampCursor,
  filterFingerprint,
} from "../../pagination";
import { errorResult, jsonResult } from "./helpers";

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export interface SnippetToolsDeps {
  snippetService: SnippetService;
  getMcpContext: () => McpContext;
}

export function registerSnippetTools(server: McpServer, deps: SnippetToolsDeps): void {
  const { snippetService } = deps;

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
      let cursor: { postedAt: Date; id: string } | undefined;
      if (pageToken) {
        const decoded = decodePageToken(pageToken);
        if (!decoded || decoded.fp !== fp || !decoded.id || !validateTimestampCursor(decoded)) {
          return errorResult("validation_error", "Invalid or mismatched pageToken.");
        }
        cursor = { postedAt: new Date(decoded.v), id: decoded.id };
      }

      const result = await snippetService.listSnippetsKeyset(
        {
          postedById: postedBy,
          mentionedUserIds: mentionedUser ? [mentionedUser] : undefined,
          mentionedUsergroupIds: mentionedUsergroup ? [mentionedUsergroup] : undefined,
          periodStart: periodStart ? new Date(periodStart) : undefined,
          periodEnd: periodEnd ? new Date(periodEnd) : undefined,
        },
        { pageSize, cursor },
      );

      const lastSnippet = result.snippets[result.snippets.length - 1];
      const nextPageToken =
        result.hasNextPage && lastSnippet
          ? encodePageToken({ fp, v: lastSnippet.postedAt.toISOString(), id: lastSnippet.id })
          : "";

      return jsonResult({
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
      });
    },
  );
}
