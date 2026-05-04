import { eq, inArray, ilike, or, sql, asc, ne, and, isNull } from "drizzle-orm";
import type { Database } from "../../infrastructure/db/client";
import { users } from "../../infrastructure/db/schema";

export type UserRole = "user" | "admin";

export function createUserService(db: Database) {
  async function findOrCreateUser(data: {
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
    // Use a transaction with an advisory lock to prevent race conditions
    // where concurrent first logins could all observe zero users and
    // each receive the admin role.
    const [created] = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('first_user_admin_bootstrap'))`);
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(users);
      const role: UserRole = count === 0 ? "admin" : "user";
      return tx
        .insert(users)
        .values({ ...data, role })
        .returning();
    });
    return created;
  }

  async function findUserById(id: string) {
    return db.query.users.findFirst({
      where: eq(users.id, id),
    });
  }

  async function findUserBySlackUserId(slackUserId: string) {
    return db.query.users.findFirst({
      where: eq(users.slackUserId, slackUserId),
    });
  }

  async function findUsersBySlackUserIds(slackUserIds: string[]) {
    if (slackUserIds.length === 0) return [];
    return db.query.users.findMany({
      where: inArray(users.slackUserId, slackUserIds),
    });
  }

  async function isAdmin(userId: string): Promise<boolean> {
    const u = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { role: true },
    });
    return u?.role === "admin";
  }

  async function listAllUsers() {
    return db.query.users.findMany({
      orderBy: [asc(users.displayName)],
    });
  }

  async function listActiveUsers() {
    return db.query.users.findMany({
      where: isNull(users.deactivatedAt),
      orderBy: [asc(users.displayName)],
    });
  }

  async function listUsersPaginated(opts: { page: number; perPage: number; query?: string }) {
    const { page, perPage, query } = opts;
    const offset = (page - 1) * perPage;

    const conditions = query?.trim()
      ? or(ilike(users.displayName, `%${query.trim()}%`), ilike(users.email, `%${query.trim()}%`))
      : undefined;

    const [rows, [{ count }]] = await Promise.all([
      db.query.users.findMany({
        where: conditions,
        orderBy: [asc(users.displayName)],
        limit: perPage,
        offset,
      }),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(conditions ?? sql`true`),
    ]);

    return { users: rows, total: count, page, perPage };
  }

  async function setUserRole(userId: string, role: UserRole) {
    const [updated] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async function updateUserTheme(userId: string, theme: string) {
    const [updated] = await db
      .update(users)
      .set({ theme, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async function updateUserLocale(userId: string, locale: string) {
    const [updated] = await db
      .update(users)
      .set({ locale, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async function countAdminsExcluding(userId: string): Promise<number> {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.role, "admin"), ne(users.id, userId)));
    return count;
  }

  async function deactivateUser(userId: string) {
    const [updated] = await db
      .update(users)
      .set({ deactivatedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async function reactivateUser(userId: string) {
    const [updated] = await db
      .update(users)
      .set({ deactivatedAt: null, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async function isDeactivated(userId: string): Promise<boolean> {
    const u = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { deactivatedAt: true },
    });
    return u?.deactivatedAt != null;
  }

  // Case-insensitive name/email search for owner autocomplete.
  // Excludes deactivated users.
  async function searchUsersByName(
    q: string,
    opts: { excludeIds?: string[]; limit?: number } = {},
  ) {
    const query = q.trim();
    if (!query) return [];
    const like = `%${query}%`;
    const excluded = opts.excludeIds ?? [];
    const rows = await db.query.users.findMany({
      where: and(
        or(ilike(users.displayName, like), ilike(users.email, like)),
        isNull(users.deactivatedAt),
      ),
      orderBy: (u, { asc }) => asc(u.displayName),
      limit: (opts.limit ?? 8) + excluded.length,
    });
    const filtered = rows.filter((r) => !excluded.includes(r.id));
    return filtered.slice(0, opts.limit ?? 8);
  }

  return {
    findOrCreateUser,
    findUserById,
    findUserBySlackUserId,
    findUsersBySlackUserIds,
    isAdmin,
    isDeactivated,
    listAllUsers,
    listActiveUsers,
    setUserRole,
    deactivateUser,
    reactivateUser,
    updateUserTheme,
    updateUserLocale,
    countAdminsExcluding,
    listUsersPaginated,
    searchUsersByName,
  };
}

export type UserService = ReturnType<typeof createUserService>;
