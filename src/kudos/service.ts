import { eq, and, desc, gte, lt, sql, isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  kudos,
  kudosChannels,
  kudosEntries,
  kudosEntryMentionedUsers,
  kudosEntryMentionedUsergroups,
  usergroupMembers,
  users,
} from "../db/schema";

export interface KudosEntryWithContext {
  entryId: string;
  message: string;
  poster: { id: string; displayName: string; avatarUrl: string | null };
  postedAt: Date;
  slackPermalink: string | null;
}

export interface ListKudosFilters {
  mentionedUserId?: string;
  postedById?: string;
  periodStart?: Date;
  periodEnd?: Date;
  limit?: number;
  offset?: number;
}

export function createKudosService(db: Database) {
  async function createKudos(data: {
    slackMessageTs?: string;
    slackChannelId?: string;
    slackPermalink?: string;
    postedAt: Date;
    postedById: string;
    entries: {
      message: string;
      mentionedUserIds: string[];
      mentionedUsergroupIds: string[];
    }[];
  }) {
    const { entries: entryData, ...kudosData } = data;

    const result = await db
      .insert(kudos)
      .values(kudosData)
      .onConflictDoNothing({
        target: [kudos.slackChannelId, kudos.slackMessageTs],
      })
      .returning();

    if (result.length === 0) return null;
    const [kudosRecord] = result;

    for (const entry of entryData) {
      const [entryRecord] = await db
        .insert(kudosEntries)
        .values({ kudosId: kudosRecord.id, message: entry.message })
        .returning();

      if (entry.mentionedUserIds.length > 0) {
        await db.insert(kudosEntryMentionedUsers).values(
          entry.mentionedUserIds.map((userId) => ({
            kudosEntryId: entryRecord.id,
            userId,
          })),
        );
      }

      if (entry.mentionedUsergroupIds.length > 0) {
        await db.insert(kudosEntryMentionedUsergroups).values(
          entry.mentionedUsergroupIds.map((usergroupId) => ({
            kudosEntryId: entryRecord.id,
            usergroupId,
          })),
        );
      }
    }

    return kudosRecord;
  }

  async function listKudosEntries(
    filters: ListKudosFilters,
  ): Promise<{ entries: KudosEntryWithContext[]; total: number }> {
    const conditions = [];
    if (filters.postedById) {
      conditions.push(eq(kudos.postedById, filters.postedById));
    }
    if (filters.periodStart) {
      conditions.push(gte(kudos.postedAt, filters.periodStart));
    }
    if (filters.periodEnd) {
      conditions.push(lt(kudos.postedAt, filters.periodEnd));
    }

    if (filters.mentionedUserId) {
      const directMentionEntryIds = db
        .select({ entryId: kudosEntryMentionedUsers.kudosEntryId })
        .from(kudosEntryMentionedUsers)
        .where(eq(kudosEntryMentionedUsers.userId, filters.mentionedUserId));

      const groupMentionEntryIds = db
        .select({ entryId: kudosEntryMentionedUsergroups.kudosEntryId })
        .from(kudosEntryMentionedUsergroups)
        .innerJoin(
          usergroupMembers,
          and(
            eq(kudosEntryMentionedUsergroups.usergroupId, usergroupMembers.usergroupId),
            eq(usergroupMembers.userId, filters.mentionedUserId),
          ),
        );

      conditions.push(
        sql`(${kudosEntries.id} IN (${directMentionEntryIds}) OR ${kudosEntries.id} IN (${groupMentionEntryIds}))`,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await db
      .select({ total: sql<number>`count(DISTINCT ${kudosEntries.id})::int` })
      .from(kudosEntries)
      .innerJoin(kudos, eq(kudosEntries.kudosId, kudos.id))
      .where(where);

    const rows = await db
      .select({
        entryId: kudosEntries.id,
        message: kudosEntries.message,
        postedAt: kudos.postedAt,
        slackPermalink: kudos.slackPermalink,
        posterId: kudos.postedById,
        posterDisplayName: users.displayName,
        posterAvatarUrl: users.avatarUrl,
      })
      .from(kudosEntries)
      .innerJoin(kudos, eq(kudosEntries.kudosId, kudos.id))
      .innerJoin(users, eq(kudos.postedById, users.id))
      .where(where)
      .orderBy(desc(kudos.postedAt))
      .limit(filters.limit ?? 50)
      .offset(filters.offset ?? 0);

    const entries: KudosEntryWithContext[] = rows.map((row) => ({
      entryId: row.entryId,
      message: row.message,
      poster: {
        id: row.posterId,
        displayName: row.posterDisplayName,
        avatarUrl: row.posterAvatarUrl,
      },
      postedAt: row.postedAt,
      slackPermalink: row.slackPermalink,
    }));

    return { entries, total };
  }

  // Channel management
  async function listKudosChannels() {
    return db.query.kudosChannels.findMany({
      orderBy: (c, { asc }) => asc(c.createdAt),
    });
  }

  async function addKudosChannel(slackChannelId: string) {
    const [channel] = await db
      .insert(kudosChannels)
      .values({ slackChannelId })
      .onConflictDoNothing()
      .returning();
    return channel;
  }

  async function removeKudosChannel(id: string) {
    await db.delete(kudosChannels).where(eq(kudosChannels.id, id));
  }

  async function isKudosChannel(slackChannelId: string): Promise<boolean> {
    const channel = await db.query.kudosChannels.findFirst({
      where: eq(kudosChannels.slackChannelId, slackChannelId),
    });
    return !!channel;
  }

  async function findKudosBySlackMessage(channelId: string, messageTs: string) {
    return db.query.kudos.findFirst({
      where: and(eq(kudos.slackChannelId, channelId), eq(kudos.slackMessageTs, messageTs)),
    });
  }

  async function getDistinctKudosPosters() {
    const rows = await db
      .selectDistinct({
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(kudos)
      .innerJoin(users, eq(kudos.postedById, users.id))
      .where(isNull(users.deactivatedAt))
      .orderBy(users.displayName);
    return rows;
  }

  async function getDistinctMentionedUsers() {
    // Users directly mentioned in kudos entries
    const directRows = await db
      .selectDistinct({
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(kudosEntryMentionedUsers)
      .innerJoin(users, eq(kudosEntryMentionedUsers.userId, users.id))
      .where(isNull(users.deactivatedAt));

    // Users mentioned via usergroup membership
    const groupRows = await db
      .selectDistinct({
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(kudosEntryMentionedUsergroups)
      .innerJoin(
        usergroupMembers,
        eq(kudosEntryMentionedUsergroups.usergroupId, usergroupMembers.usergroupId),
      )
      .innerJoin(users, eq(usergroupMembers.userId, users.id))
      .where(isNull(users.deactivatedAt));

    // Deduplicate
    const userMap = new Map<
      string,
      { id: string; displayName: string; avatarUrl: string | null }
    >();
    for (const row of [...directRows, ...groupRows]) {
      if (!userMap.has(row.id)) {
        userMap.set(row.id, row);
      }
    }

    return Array.from(userMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  return {
    createKudos,
    listKudosEntries,
    listKudosChannels,
    addKudosChannel,
    removeKudosChannel,
    isKudosChannel,
    findKudosBySlackMessage,
    getDistinctKudosPosters,
    getDistinctMentionedUsers,
  };
}

export type KudosService = ReturnType<typeof createKudosService>;
