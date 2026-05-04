import {
  type SQL,
  eq,
  and,
  or,
  desc,
  gte,
  lt,
  inArray,
  isNull,
  count as drizzleCount,
} from "drizzle-orm";
import type { Database } from "../db/client";
import {
  snippets,
  snippetChannels,
  snippetMentionedUsers,
  snippetMentionedUsergroups,
  usergroups,
  users,
} from "../db/schema";

export interface SnippetWithAuthor {
  id: string;
  content: string;
  postedAt: Date;
  slackMessageTs: string | null;
  slackChannelId: string | null;
  slackPermalink: string | null;
  postedById: string;
  poster: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  mentionedUsers: { id: string; displayName: string }[];
  mentionedUsergroups: { id: string; name: string; handle: string | null }[];
}

export interface SnippetFilters {
  mentionedUserIds?: string[];
  mentionedUsergroupIds?: string[];
  postedById?: string;
  periodStart?: Date;
  periodEnd?: Date;
}

export interface ListSnippetsFilters extends SnippetFilters {
  limit?: number;
  offset?: number;
}

export interface KeysetPaginationParams {
  pageSize: number;
  cursor?: { postedAt: Date; id: string };
}

export interface KeysetResult {
  snippets: SnippetWithAuthor[];
  total: number;
  hasNextPage: boolean;
}

export function createSnippetService(db: Database) {
  async function createSnippet(data: {
    content: string;
    postedAt: Date;
    slackMessageTs?: string;
    slackChannelId?: string;
    slackPermalink?: string;
    postedById: string;
    mentionedUserIds: string[];
    mentionedUsergroupIds: string[];
  }) {
    const { mentionedUserIds, mentionedUsergroupIds, ...snippetData } = data;

    const result = await db
      .insert(snippets)
      .values(snippetData)
      .onConflictDoNothing({
        target: [snippets.slackChannelId, snippets.slackMessageTs],
      })
      .returning();

    // Conflict means duplicate Slack event delivery — skip silently
    if (result.length === 0) return null;
    const [snippet] = result;

    if (mentionedUserIds.length > 0) {
      await db.insert(snippetMentionedUsers).values(
        mentionedUserIds.map((userId) => ({
          snippetId: snippet.id,
          userId,
        })),
      );
    }

    if (mentionedUsergroupIds.length > 0) {
      await db.insert(snippetMentionedUsergroups).values(
        mentionedUsergroupIds.map((usergroupId) => ({
          snippetId: snippet.id,
          usergroupId,
        })),
      );
    }

    return snippet;
  }

  // ---------------------------------------------------------------------------
  // Shared query helpers
  // ---------------------------------------------------------------------------

  function buildFilterConditions(filters: SnippetFilters): SQL[] {
    const conditions: SQL[] = [];

    if (filters.postedById) {
      conditions.push(eq(snippets.postedById, filters.postedById));
    }
    if (filters.periodStart) {
      conditions.push(gte(snippets.postedAt, filters.periodStart));
    }
    if (filters.periodEnd) {
      conditions.push(lt(snippets.postedAt, filters.periodEnd));
    }

    const mentionConditions: SQL[] = [];
    if (filters.mentionedUserIds && filters.mentionedUserIds.length > 0) {
      const mentionedSnippetIds = db
        .select({ snippetId: snippetMentionedUsers.snippetId })
        .from(snippetMentionedUsers)
        .where(inArray(snippetMentionedUsers.userId, filters.mentionedUserIds));
      mentionConditions.push(inArray(snippets.id, mentionedSnippetIds));
    }
    if (filters.mentionedUsergroupIds && filters.mentionedUsergroupIds.length > 0) {
      const mentionedSnippetIds = db
        .select({ snippetId: snippetMentionedUsergroups.snippetId })
        .from(snippetMentionedUsergroups)
        .where(inArray(snippetMentionedUsergroups.usergroupId, filters.mentionedUsergroupIds));
      mentionConditions.push(inArray(snippets.id, mentionedSnippetIds));
    }
    if (mentionConditions.length > 0) {
      conditions.push(
        mentionConditions.length === 1 ? mentionConditions[0] : or(...mentionConditions)!,
      );
    }

    return conditions;
  }

  async function fetchMentions(snippetIds: string[]) {
    const mentionedUsersMap = new Map<string, { id: string; displayName: string }[]>();
    const mentionedGroupsMap = new Map<
      string,
      { id: string; name: string; handle: string | null }[]
    >();

    if (snippetIds.length === 0) {
      return { mentionedUsersMap, mentionedGroupsMap };
    }

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

    return { mentionedUsersMap, mentionedGroupsMap };
  }

  type SnippetRow = {
    id: string;
    content: string;
    postedAt: Date;
    slackMessageTs: string | null;
    slackChannelId: string | null;
    slackPermalink: string | null;
    postedById: string;
    posterDisplayName: string;
    posterAvatarUrl: string | null;
  };

  function hydrateSnippets(
    rows: SnippetRow[],
    mentionedUsersMap: Map<string, { id: string; displayName: string }[]>,
    mentionedGroupsMap: Map<string, { id: string; name: string; handle: string | null }[]>,
  ): SnippetWithAuthor[] {
    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      postedAt: row.postedAt,
      slackMessageTs: row.slackMessageTs,
      slackChannelId: row.slackChannelId,
      slackPermalink: row.slackPermalink,
      postedById: row.postedById,
      poster: {
        id: row.postedById,
        displayName: row.posterDisplayName,
        avatarUrl: row.posterAvatarUrl,
      },
      mentionedUsers: mentionedUsersMap.get(row.id) ?? [],
      mentionedUsergroups: mentionedGroupsMap.get(row.id) ?? [],
    }));
  }

  // ---------------------------------------------------------------------------
  // Public listing methods
  // ---------------------------------------------------------------------------

  async function listSnippets(
    filters: ListSnippetsFilters,
  ): Promise<{ snippets: SnippetWithAuthor[]; total: number }> {
    const filterConditions = buildFilterConditions(filters);
    const where = filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const [{ total }] = await db.select({ total: drizzleCount() }).from(snippets).where(where);

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const rows = await db
      .select({
        id: snippets.id,
        content: snippets.content,
        postedAt: snippets.postedAt,
        slackMessageTs: snippets.slackMessageTs,
        slackChannelId: snippets.slackChannelId,
        slackPermalink: snippets.slackPermalink,
        postedById: snippets.postedById,
        posterDisplayName: users.displayName,
        posterAvatarUrl: users.avatarUrl,
      })
      .from(snippets)
      .innerJoin(users, eq(snippets.postedById, users.id))
      .where(where)
      .orderBy(desc(snippets.postedAt), desc(snippets.id))
      .limit(limit)
      .offset(offset);

    const snippetIds = rows.map((r) => r.id);
    const { mentionedUsersMap, mentionedGroupsMap } = await fetchMentions(snippetIds);

    return { snippets: hydrateSnippets(rows, mentionedUsersMap, mentionedGroupsMap), total };
  }

  async function listSnippetsKeyset(
    filters: SnippetFilters,
    pagination: KeysetPaginationParams,
  ): Promise<KeysetResult> {
    const filterConditions = buildFilterConditions(filters);
    const where = filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const [{ total }] = await db.select({ total: drizzleCount() }).from(snippets).where(where);

    // Add cursor condition for keyset pagination
    const allConditions = [...filterConditions];
    if (pagination.cursor) {
      const { postedAt, id } = pagination.cursor;
      allConditions.push(
        or(
          lt(snippets.postedAt, postedAt),
          and(eq(snippets.postedAt, postedAt), lt(snippets.id, id)),
        )!,
      );
    }
    const allWhere = allConditions.length > 0 ? and(...allConditions) : undefined;

    const rows = await db
      .select({
        id: snippets.id,
        content: snippets.content,
        postedAt: snippets.postedAt,
        slackMessageTs: snippets.slackMessageTs,
        slackChannelId: snippets.slackChannelId,
        slackPermalink: snippets.slackPermalink,
        postedById: snippets.postedById,
        posterDisplayName: users.displayName,
        posterAvatarUrl: users.avatarUrl,
      })
      .from(snippets)
      .innerJoin(users, eq(snippets.postedById, users.id))
      .where(allWhere)
      .orderBy(desc(snippets.postedAt), desc(snippets.id))
      .limit(pagination.pageSize + 1);

    const hasNextPage = rows.length > pagination.pageSize;
    const page = hasNextPage ? rows.slice(0, pagination.pageSize) : rows;

    const snippetIds = page.map((r) => r.id);
    const { mentionedUsersMap, mentionedGroupsMap } = await fetchMentions(snippetIds);

    return {
      snippets: hydrateSnippets(page, mentionedUsersMap, mentionedGroupsMap),
      total,
      hasNextPage,
    };
  }

  async function listSnippetChannels() {
    return db.query.snippetChannels.findMany({
      orderBy: (c, { asc }) => asc(c.createdAt),
    });
  }

  async function addSnippetChannel(slackChannelId: string) {
    const [channel] = await db
      .insert(snippetChannels)
      .values({ slackChannelId })
      .onConflictDoNothing()
      .returning();
    return channel;
  }

  async function removeSnippetChannel(id: string) {
    await db.delete(snippetChannels).where(eq(snippetChannels.id, id));
  }

  async function isSnippetChannel(slackChannelId: string): Promise<boolean> {
    const channel = await db.query.snippetChannels.findFirst({
      where: eq(snippetChannels.slackChannelId, slackChannelId),
    });
    return !!channel;
  }

  async function getDistinctMentionedUsergroups() {
    const rows = await db
      .selectDistinct({
        id: usergroups.id,
        name: usergroups.name,
        handle: usergroups.handle,
      })
      .from(snippetMentionedUsergroups)
      .innerJoin(usergroups, eq(snippetMentionedUsergroups.usergroupId, usergroups.id))
      .orderBy(usergroups.name);
    return rows;
  }

  async function getDistinctPosters() {
    const rows = await db
      .selectDistinct({
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(snippets)
      .innerJoin(users, eq(snippets.postedById, users.id))
      .where(isNull(users.deactivatedAt))
      .orderBy(users.displayName);
    return rows;
  }

  async function findSnippetBySlackMessage(channelId: string, messageTs: string) {
    return db.query.snippets.findFirst({
      where: and(eq(snippets.slackChannelId, channelId), eq(snippets.slackMessageTs, messageTs)),
    });
  }

  return {
    createSnippet,
    listSnippets,
    listSnippetsKeyset,
    listSnippetChannels,
    addSnippetChannel,
    removeSnippetChannel,
    isSnippetChannel,
    getDistinctMentionedUsergroups,
    getDistinctPosters,
    findSnippetBySlackMessage,
  };
}

export type SnippetService = ReturnType<typeof createSnippetService>;
