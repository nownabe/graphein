import { eq, ne, and, desc, gte, lt, sql, isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  kudos,
  kudosChannels,
  kudosEntries,
  kudosEntryMentionedUsers,
  kudosEntryMentionedUsergroups,
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

    return db.transaction(async (tx) => {
      const result = await tx
        .insert(kudos)
        .values(kudosData)
        .onConflictDoNothing({
          target: [kudos.slackChannelId, kudos.slackMessageTs],
        })
        .returning();

      if (result.length === 0) return null;
      const [kudosRecord] = result;

      for (const entry of entryData) {
        const [entryRecord] = await tx
          .insert(kudosEntries)
          .values({ kudosId: kudosRecord.id, message: entry.message })
          .returning();

        const uniqueUserIds = [...new Set(entry.mentionedUserIds)];
        if (uniqueUserIds.length > 0) {
          await tx.insert(kudosEntryMentionedUsers).values(
            uniqueUserIds.map((userId) => ({
              kudosEntryId: entryRecord.id,
              userId,
            })),
          );
        }

        const uniqueUsergroupIds = [...new Set(entry.mentionedUsergroupIds)];
        if (uniqueUsergroupIds.length > 0) {
          await tx.insert(kudosEntryMentionedUsergroups).values(
            uniqueUsergroupIds.map((usergroupId) => ({
              kudosEntryId: entryRecord.id,
              usergroupId,
            })),
          );
        }
      }

      return kudosRecord;
    });
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
      // Group members are expanded to kudosEntryMentionedUsers at write time,
      // so we only need to check this single table.
      const mentionEntryIds = db
        .select({ entryId: kudosEntryMentionedUsers.kudosEntryId })
        .from(kudosEntryMentionedUsers)
        .where(eq(kudosEntryMentionedUsers.userId, filters.mentionedUserId));

      conditions.push(sql`${kudosEntries.id} IN (${mentionEntryIds})`);
      // Exclude kudos that the mentioned user posted themselves, so the filter
      // only shows kudos posted by other people mentioning this user.
      conditions.push(ne(kudos.postedById, filters.mentionedUserId));
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
    // Group members are expanded to kudosEntryMentionedUsers at write time,
    // so this single query covers both direct and group mentions.
    // Exclude users who only appear as self-mentions (i.e., only mentioned in
    // kudos they posted themselves), since filtering by them would yield no
    // results after the self-posted exclusion in listKudosEntries.
    const rows = await db
      .selectDistinct({
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(kudosEntryMentionedUsers)
      .innerJoin(users, eq(kudosEntryMentionedUsers.userId, users.id))
      .innerJoin(kudosEntries, eq(kudosEntryMentionedUsers.kudosEntryId, kudosEntries.id))
      .innerJoin(kudos, eq(kudosEntries.kudosId, kudos.id))
      .where(
        and(isNull(users.deactivatedAt), ne(kudos.postedById, kudosEntryMentionedUsers.userId)),
      )
      .orderBy(users.displayName);
    return rows;
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
