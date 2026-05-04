import { z } from "zod";
import { type SQL, and, or, asc, ilike, sql, count as drizzleCount } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "../../../db/client";
import { users } from "../../../db/schema";
import type { UserService } from "../../../users/service";
import type { SnippetService } from "../../../snippets/service";
import type { KudosService } from "../../../kudos/service";
import type { McpContext } from "../types";

import {
  encodePageToken,
  decodePageToken,
  filterFingerprint,
  UUID_REGEX,
} from "../../../pagination";
import { errorResult, jsonResult } from "./helpers";

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export interface AdminToolsDeps {
  db: Database;
  userService: UserService;
  snippetService: SnippetService;
  kudosService: KudosService;
  getMcpContext: () => McpContext;
}

export function registerAdminTools(server: McpServer, deps: AdminToolsDeps): void {
  const { db, userService, snippetService, kudosService, getMcpContext } = deps;

  function requireAdmin(): ReturnType<typeof errorResult> | null {
    const { role } = getMcpContext();
    if (role !== "admin") {
      return errorResult("forbidden", "Admin role required.");
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // list_users
  // -------------------------------------------------------------------------

  server.registerTool(
    "list_users",
    {
      description: "List all users with optional search. Requires admin role.",
      inputSchema: {
        query: z.string().optional().describe("Search by display name or email."),
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
    async ({ query, pageSize, pageToken }) => {
      const denied = requireAdmin();
      if (denied) return denied;

      const fp = filterFingerprint({ query });

      const searchQuery = query?.trim();
      const filterCondition = searchQuery
        ? or(ilike(users.displayName, `%${searchQuery}%`), ilike(users.email, `%${searchQuery}%`))
        : undefined;

      let cursorCondition: SQL | undefined;
      if (pageToken) {
        const cursor = decodePageToken(pageToken);
        if (!cursor || cursor.fp !== fp || !cursor.id || !UUID_REGEX.test(cursor.id)) {
          return errorResult("validation_error", "Invalid or mismatched pageToken.");
        }
        cursorCondition = or(
          sql`${users.displayName} > ${cursor.v}`,
          and(sql`${users.displayName} = ${cursor.v}`, sql`${users.id} > ${cursor.id}`),
        );
      }

      const [{ total }] = await db
        .select({ total: drizzleCount() })
        .from(users)
        .where(filterCondition);

      const allConditions = [filterCondition, cursorCondition].filter(Boolean);
      const where = allConditions.length > 0 ? and(...(allConditions as SQL[])) : undefined;

      const rows = await db
        .select()
        .from(users)
        .where(where)
        .orderBy(asc(users.displayName), asc(users.id))
        .limit(pageSize + 1);

      const hasNext = rows.length > pageSize;
      const page = hasNext ? rows.slice(0, pageSize) : rows;

      const lastRow = page[page.length - 1];
      const nextPageToken =
        hasNext && lastRow ? encodePageToken({ fp, v: lastRow.displayName, id: lastRow.id }) : "";

      return jsonResult({
        users: page.map((u) => ({
          id: u.id,
          slackUserId: u.slackUserId,
          email: u.email,
          displayName: u.displayName,
          avatarUrl: u.avatarUrl,
          role: u.role,
          locale: u.locale,
          deactivatedAt: u.deactivatedAt?.toISOString() ?? null,
          createdAt: u.createdAt.toISOString(),
        })),
        totalSize: total,
        nextPageToken,
      });
    },
  );

  // -------------------------------------------------------------------------
  // deactivate_user
  // -------------------------------------------------------------------------

  server.registerTool(
    "deactivate_user",
    {
      description: "Deactivate a user. Idempotent. Requires admin role.",
      inputSchema: {
        userId: z.string().uuid().describe("The user ID."),
      },
    },
    async ({ userId }) => {
      const denied = requireAdmin();
      if (denied) return denied;

      const { user: currentUser } = getMcpContext();
      if (userId === currentUser.id) {
        return errorResult("validation_error", "Cannot deactivate yourself.");
      }

      const user = await userService.findUserById(userId);
      if (!user) {
        return errorResult("not_found", "User not found.");
      }

      if (user.deactivatedAt) {
        return jsonResult({
          id: user.id,
          displayName: user.displayName,
          deactivatedAt: user.deactivatedAt.toISOString(),
        });
      }

      const updated = await userService.deactivateUser(userId);
      return jsonResult({
        id: updated!.id,
        displayName: updated!.displayName,
        deactivatedAt: updated!.deactivatedAt!.toISOString(),
      });
    },
  );

  // -------------------------------------------------------------------------
  // list_snippet_channels
  // -------------------------------------------------------------------------

  server.registerTool(
    "list_snippet_channels",
    {
      description: "List snippet-monitored Slack channels. Requires admin role.",
      inputSchema: {},
    },
    async () => {
      const denied = requireAdmin();
      if (denied) return denied;

      const channels = await snippetService.listSnippetChannels();
      return jsonResult({
        snippetChannels: channels.map((ch) => ({
          id: ch.id,
          slackChannelId: ch.slackChannelId,
          createdAt: ch.createdAt.toISOString(),
        })),
      });
    },
  );

  // -------------------------------------------------------------------------
  // add_snippet_channel
  // -------------------------------------------------------------------------

  server.registerTool(
    "add_snippet_channel",
    {
      description: "Add a snippet-monitored Slack channel. Idempotent. Requires admin role.",
      inputSchema: {
        slackChannelId: z.string().min(1).describe("Slack channel ID to add."),
      },
    },
    async ({ slackChannelId }) => {
      const denied = requireAdmin();
      if (denied) return denied;

      const { channel } = await snippetService.addSnippetChannel(slackChannelId);
      return jsonResult({
        id: channel.id,
        slackChannelId: channel.slackChannelId,
        createdAt: channel.createdAt.toISOString(),
      });
    },
  );

  // -------------------------------------------------------------------------
  // remove_snippet_channel
  // -------------------------------------------------------------------------

  server.registerTool(
    "remove_snippet_channel",
    {
      description: "Remove a snippet-monitored Slack channel. Requires admin role.",
      inputSchema: {
        channelId: z.string().uuid().describe("The channel record ID."),
      },
    },
    async ({ channelId }) => {
      const denied = requireAdmin();
      if (denied) return denied;

      const result = await snippetService.removeSnippetChannel(channelId);
      if (!result.found) {
        return errorResult("not_found", "Snippet channel not found.");
      }

      return jsonResult({ success: true });
    },
  );

  // -------------------------------------------------------------------------
  // list_kudos_channels
  // -------------------------------------------------------------------------

  server.registerTool(
    "list_kudos_channels",
    {
      description: "List kudos-monitored Slack channels. Requires admin role.",
      inputSchema: {},
    },
    async () => {
      const denied = requireAdmin();
      if (denied) return denied;

      const channels = await kudosService.listKudosChannels();
      return jsonResult({
        kudosChannels: channels.map((ch) => ({
          id: ch.id,
          slackChannelId: ch.slackChannelId,
          createdAt: ch.createdAt.toISOString(),
        })),
      });
    },
  );

  // -------------------------------------------------------------------------
  // add_kudos_channel
  // -------------------------------------------------------------------------

  server.registerTool(
    "add_kudos_channel",
    {
      description: "Add a kudos-monitored Slack channel. Idempotent. Requires admin role.",
      inputSchema: {
        slackChannelId: z.string().min(1).describe("Slack channel ID to add."),
      },
    },
    async ({ slackChannelId }) => {
      const denied = requireAdmin();
      if (denied) return denied;

      const { channel } = await kudosService.addKudosChannel(slackChannelId);
      return jsonResult({
        id: channel.id,
        slackChannelId: channel.slackChannelId,
        createdAt: channel.createdAt.toISOString(),
      });
    },
  );

  // -------------------------------------------------------------------------
  // remove_kudos_channel
  // -------------------------------------------------------------------------

  server.registerTool(
    "remove_kudos_channel",
    {
      description: "Remove a kudos-monitored Slack channel. Requires admin role.",
      inputSchema: {
        channelId: z.string().uuid().describe("The channel record ID."),
      },
    },
    async ({ channelId }) => {
      const denied = requireAdmin();
      if (denied) return denied;

      const result = await kudosService.removeKudosChannel(channelId);
      if (!result.found) {
        return errorResult("not_found", "Kudos channel not found.");
      }

      return jsonResult({ success: true });
    },
  );
}
