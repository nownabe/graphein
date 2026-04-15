import { eq, and, or, desc, gte, lt, sql, inArray } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  snippets,
  snippetChannels,
  snippetMentionedUsers,
  snippetMentionedUsergroups,
  usergroupMembers,
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

export interface ListSnippetsFilters {
  mentionedUserIds?: string[];
  mentionedUsergroupIds?: string[];
  postedById?: string;
  periodStart?: Date;
  periodEnd?: Date;
  limit?: number;
  offset?: number;
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

  async function listSnippets(
    filters: ListSnippetsFilters,
  ): Promise<{ snippets: SnippetWithAuthor[]; total: number }> {
    const conditions = [];

    if (filters.postedById) {
      conditions.push(eq(snippets.postedById, filters.postedById));
    }
    if (filters.periodStart) {
      conditions.push(gte(snippets.postedAt, filters.periodStart));
    }
    if (filters.periodEnd) {
      conditions.push(lt(snippets.postedAt, filters.periodEnd));
    }

    // For mention filters, combine user and group mentions with OR
    const mentionConditions = [];
    if (filters.mentionedUserIds && filters.mentionedUserIds.length > 0) {
      const mentionedSnippetIds = db
        .select({ snippetId: snippetMentionedUsers.snippetId })
        .from(snippetMentionedUsers)
        .where(inArray(snippetMentionedUsers.userId, filters.mentionedUserIds));
      mentionConditions.push(sql`${snippets.id} IN (${mentionedSnippetIds})`);
    }
    if (filters.mentionedUsergroupIds && filters.mentionedUsergroupIds.length > 0) {
      const mentionedSnippetIds = db
        .select({ snippetId: snippetMentionedUsergroups.snippetId })
        .from(snippetMentionedUsergroups)
        .where(inArray(snippetMentionedUsergroups.usergroupId, filters.mentionedUsergroupIds));
      mentionConditions.push(sql`${snippets.id} IN (${mentionedSnippetIds})`);
    }
    if (mentionConditions.length > 0) {
      conditions.push(or(...mentionConditions)!);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Count total
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(snippets)
      .where(where);

    // Fetch snippets with poster info
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
      .orderBy(desc(snippets.postedAt))
      .limit(limit)
      .offset(offset);

    // Fetch mentions for all snippets
    const snippetIds = rows.map((r) => r.id);
    const result: SnippetWithAuthor[] = [];

    if (snippetIds.length === 0) {
      return { snippets: [], total };
    }

    const mentionedUsersRows = await db
      .select({
        snippetId: snippetMentionedUsers.snippetId,
        userId: snippetMentionedUsers.userId,
        displayName: users.displayName,
      })
      .from(snippetMentionedUsers)
      .innerJoin(users, eq(snippetMentionedUsers.userId, users.id))
      .where(
        sql`${snippetMentionedUsers.snippetId} IN (${sql.join(
          snippetIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );

    const mentionedGroupsRows = await db
      .select({
        snippetId: snippetMentionedUsergroups.snippetId,
        usergroupId: snippetMentionedUsergroups.usergroupId,
        name: usergroups.name,
        handle: usergroups.handle,
      })
      .from(snippetMentionedUsergroups)
      .innerJoin(usergroups, eq(snippetMentionedUsergroups.usergroupId, usergroups.id))
      .where(
        sql`${snippetMentionedUsergroups.snippetId} IN (${sql.join(
          snippetIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );

    const mentionedUsersMap = new Map<string, { id: string; displayName: string }[]>();
    for (const row of mentionedUsersRows) {
      const list = mentionedUsersMap.get(row.snippetId) ?? [];
      list.push({ id: row.userId, displayName: row.displayName });
      mentionedUsersMap.set(row.snippetId, list);
    }

    const mentionedGroupsMap = new Map<
      string,
      { id: string; name: string; handle: string | null }[]
    >();
    for (const row of mentionedGroupsRows) {
      const list = mentionedGroupsMap.get(row.snippetId) ?? [];
      list.push({ id: row.usergroupId, name: row.name, handle: row.handle });
      mentionedGroupsMap.set(row.snippetId, list);
    }

    for (const row of rows) {
      result.push({
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
      });
    }

    return { snippets: result, total };
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
      .orderBy(users.displayName);
    return rows;
  }

  async function findOrCreateUsergroup(slackUsergroupId: string, name: string, handle?: string) {
    const existing = await db.query.usergroups.findFirst({
      where: eq(usergroups.slackUsergroupId, slackUsergroupId),
    });

    if (existing) {
      const [updated] = await db
        .update(usergroups)
        .set({ name, handle: handle ?? existing.handle, updatedAt: new Date() })
        .where(eq(usergroups.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(usergroups)
      .values({ slackUsergroupId, name, handle })
      .returning();
    return created;
  }

  async function syncUsergroupMembers(usergroupId: string, memberUserIds: string[]) {
    // Replace all members: delete existing, insert new
    await db.delete(usergroupMembers).where(eq(usergroupMembers.usergroupId, usergroupId));
    if (memberUserIds.length > 0) {
      await db
        .insert(usergroupMembers)
        .values(memberUserIds.map((userId) => ({ usergroupId, userId })))
        .onConflictDoNothing();
    }
  }

  async function getUsergroupIdsByMember(userId: string): Promise<string[]> {
    const rows = await db
      .select({ usergroupId: usergroupMembers.usergroupId })
      .from(usergroupMembers)
      .where(eq(usergroupMembers.userId, userId));
    return rows.map((r) => r.usergroupId);
  }

  async function findSnippetBySlackMessage(channelId: string, messageTs: string) {
    return db.query.snippets.findFirst({
      where: and(eq(snippets.slackChannelId, channelId), eq(snippets.slackMessageTs, messageTs)),
    });
  }

  return {
    createSnippet,
    listSnippets,
    listSnippetChannels,
    addSnippetChannel,
    removeSnippetChannel,
    isSnippetChannel,
    getDistinctMentionedUsergroups,
    getDistinctPosters,
    findOrCreateUsergroup,
    syncUsergroupMembers,
    getUsergroupIdsByMember,
    findSnippetBySlackMessage,
  };
}

export type SnippetService = ReturnType<typeof createSnippetService>;
