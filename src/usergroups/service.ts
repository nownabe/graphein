import { eq, and, inArray } from "drizzle-orm";
import type { Database } from "../db/client";
import { usergroupMembers, usergroups } from "../db/schema";

const MEMBERSHIP_SYNC_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

export function createUsergroupService(db: Database) {
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

  async function isUsergroupMembershipStale(usergroupId: string): Promise<boolean> {
    const [group] = await db
      .select({ membersSyncedAt: usergroups.membersSyncedAt })
      .from(usergroups)
      .where(eq(usergroups.id, usergroupId));
    if (!group?.membersSyncedAt) return true;
    return Date.now() - group.membersSyncedAt.getTime() >= MEMBERSHIP_SYNC_TTL_MS;
  }

  async function syncUsergroupMembers(usergroupId: string, memberUserIds: string[]) {
    // Diff sync: only insert/delete what changed
    const existingRows = await db
      .select({ userId: usergroupMembers.userId })
      .from(usergroupMembers)
      .where(eq(usergroupMembers.usergroupId, usergroupId));
    const existingSet = new Set(existingRows.map((r) => r.userId));
    const newSet = new Set(memberUserIds);

    const toAdd = memberUserIds.filter((id) => !existingSet.has(id));
    const toRemove = existingRows.map((r) => r.userId).filter((id) => !newSet.has(id));

    if (toRemove.length > 0) {
      await db
        .delete(usergroupMembers)
        .where(
          and(
            eq(usergroupMembers.usergroupId, usergroupId),
            inArray(usergroupMembers.userId, toRemove),
          ),
        );
    }
    if (toAdd.length > 0) {
      await db
        .insert(usergroupMembers)
        .values(toAdd.map((userId) => ({ usergroupId, userId })))
        .onConflictDoNothing();
    }

    // Update sync timestamp
    await db
      .update(usergroups)
      .set({ membersSyncedAt: new Date() })
      .where(eq(usergroups.id, usergroupId));
  }

  async function getUsergroupsByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return db
      .select({ id: usergroups.id, name: usergroups.name, handle: usergroups.handle })
      .from(usergroups)
      .where(inArray(usergroups.id, ids));
  }

  async function getUsergroupIdsByMember(userId: string): Promise<string[]> {
    const rows = await db
      .select({ usergroupId: usergroupMembers.usergroupId })
      .from(usergroupMembers)
      .where(eq(usergroupMembers.userId, userId));
    return rows.map((r) => r.usergroupId);
  }

  return {
    findOrCreateUsergroup,
    isUsergroupMembershipStale,
    syncUsergroupMembers,
    getUsergroupsByIds,
    getUsergroupIdsByMember,
  };
}

export type UsergroupService = ReturnType<typeof createUsergroupService>;
