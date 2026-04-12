import { eq, inArray, ilike, or, sql, asc, ne, and } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";

export type UserRole = "user" | "admin";

export async function findOrCreateUser(data: {
  slackUserId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}) {
  const existing = await db.query.users.findFirst({
    where: eq(users.slackUserId, data.slackUserId),
  });

  if (existing) {
    const [updated] = await db
      .update(users)
      .set({
        email: data.email,
        displayName: data.displayName,
        avatarUrl: data.avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id))
      .returning();
    return updated;
  }

  // First registered user becomes admin automatically.
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  const role: UserRole = count === 0 ? "admin" : "user";

  const [created] = await db
    .insert(users)
    .values({ ...data, role })
    .returning();
  return created;
}

export async function findUserById(id: string) {
  return db.query.users.findFirst({
    where: eq(users.id, id),
  });
}

export async function findUserBySlackUserId(slackUserId: string) {
  return db.query.users.findFirst({
    where: eq(users.slackUserId, slackUserId),
  });
}

export async function findUsersBySlackUserIds(slackUserIds: string[]) {
  if (slackUserIds.length === 0) return [];
  return db.query.users.findMany({
    where: inArray(users.slackUserId, slackUserIds),
  });
}

export async function isAdmin(userId: string): Promise<boolean> {
  const u = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { role: true },
  });
  return u?.role === "admin";
}

export async function listAllUsers() {
  return db.query.users.findMany({
    orderBy: [asc(users.displayName)],
  });
}

export async function setUserRole(userId: string, role: UserRole) {
  const [updated] = await db
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return updated;
}

export async function updateUserTheme(userId: string, theme: string) {
  const [updated] = await db
    .update(users)
    .set({ theme, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return updated;
}

export async function updateUserLocale(userId: string, locale: string) {
  const [updated] = await db
    .update(users)
    .set({ locale, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return updated;
}

export async function countAdminsExcluding(userId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.role, "admin"), ne(users.id, userId)));
  return count;
}

// Case-insensitive name/email search for owner autocomplete.
export async function searchUsersByName(
  q: string,
  opts: { excludeIds?: string[]; limit?: number } = {},
) {
  const query = q.trim();
  if (!query) return [];
  const like = `%${query}%`;
  const excluded = opts.excludeIds ?? [];
  const rows = await db.query.users.findMany({
    where: or(ilike(users.displayName, like), ilike(users.email, like)),
    orderBy: (u, { asc }) => asc(u.displayName),
    limit: (opts.limit ?? 8) + excluded.length,
  });
  const filtered = rows.filter((r) => !excluded.includes(r.id));
  return filtered.slice(0, opts.limit ?? 8);
}
