import { eq, inArray, ilike, or, sql, asc, ne, and } from "drizzle-orm";
import { db } from "../db/client";
import { members } from "../db/schema";

export type MemberRole = "user" | "admin";

export async function findOrCreateMember(data: {
  slackUserId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}) {
  const existing = await db.query.members.findFirst({
    where: eq(members.slackUserId, data.slackUserId),
  });

  if (existing) {
    const [updated] = await db
      .update(members)
      .set({
        email: data.email,
        displayName: data.displayName,
        avatarUrl: data.avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(members.id, existing.id))
      .returning();
    return updated;
  }

  // First registered user becomes admin automatically.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(members);
  const role: MemberRole = count === 0 ? "admin" : "user";

  const [created] = await db
    .insert(members)
    .values({ ...data, role })
    .returning();
  return created;
}

export async function findMemberById(id: string) {
  return db.query.members.findFirst({
    where: eq(members.id, id),
  });
}

export async function findMemberBySlackUserId(slackUserId: string) {
  return db.query.members.findFirst({
    where: eq(members.slackUserId, slackUserId),
  });
}

export async function findMembersBySlackUserIds(slackUserIds: string[]) {
  if (slackUserIds.length === 0) return [];
  return db.query.members.findMany({
    where: inArray(members.slackUserId, slackUserIds),
  });
}

export async function isAdmin(memberId: string): Promise<boolean> {
  const m = await db.query.members.findFirst({
    where: eq(members.id, memberId),
    columns: { role: true },
  });
  return m?.role === "admin";
}

export async function listAllMembers() {
  return db.query.members.findMany({
    orderBy: [asc(members.displayName)],
  });
}

export async function setMemberRole(memberId: string, role: MemberRole) {
  const [updated] = await db
    .update(members)
    .set({ role, updatedAt: new Date() })
    .where(eq(members.id, memberId))
    .returning();
  return updated;
}

export async function countAdminsExcluding(memberId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(members)
    .where(and(eq(members.role, "admin"), ne(members.id, memberId)));
  return count;
}

// Case-insensitive name/email search for owner autocomplete.
export async function searchMembersByName(
  q: string,
  opts: { excludeIds?: string[]; limit?: number } = {},
) {
  const query = q.trim();
  if (!query) return [];
  const like = `%${query}%`;
  const excluded = opts.excludeIds ?? [];
  const rows = await db.query.members.findMany({
    where: or(ilike(members.displayName, like), ilike(members.email, like)),
    orderBy: (m, { asc }) => asc(m.displayName),
    limit: (opts.limit ?? 8) + excluded.length,
  });
  const filtered = rows.filter((r) => !excluded.includes(r.id));
  return filtered.slice(0, opts.limit ?? 8);
}
