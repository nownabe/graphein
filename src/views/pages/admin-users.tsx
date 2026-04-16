import type { InferSelectModel } from "drizzle-orm";
import type { users } from "../../db/schema";
import { t } from "../../i18n/index";
import { Layout } from "../layout";
import { Nav } from "../components/nav";
import { AdminTabs } from "../components/admin-tabs";

type User = InferSelectModel<typeof users>;

export function AdminUsersListInner({
  users: allUsers,
  currentUserId,
  locale,
  page,
  totalPages,
  query,
}: {
  users: User[];
  currentUserId: string;
  locale: string;
  page: number;
  totalPages: number;
  query: string;
}) {
  const adminCount = allUsers.filter((u) => u.role === "admin").length;

  function paginatedUrl(p: number) {
    const params = new URLSearchParams();
    params.set("page", String(p));
    if (query) params.set("q", query);
    return `/admin/users?${params.toString()}`;
  }

  return (
    <div id="admin-users-list">
      {/* User list */}
      {allUsers.length === 0 ? (
        <div class="bg-surface border border-edge rounded-[var(--radius-lg)] px-5 py-8 text-center text-sm text-muted">
          {t(locale, "admin.users.noResults")}
        </div>
      ) : (
        <ul class="bg-surface border border-edge rounded-[var(--radius-lg)] divide-y divide-edge">
          {allUsers.map((u) => {
            const isAdmin = u.role === "admin";
            const isSelf = u.id === currentUserId;
            const isLastAdmin = isAdmin && adminCount <= 1;
            const initial = u.displayName.charAt(0).toUpperCase();

            const actionParams = new URLSearchParams();
            actionParams.set("page", String(page));
            if (query) actionParams.set("q", query);
            const actionSuffix = `?${actionParams.toString()}`;

            return (
              <li key={u.id} class="flex items-center gap-3 px-5 py-4">
                {u.avatarUrl ? (
                  <img
                    src={u.avatarUrl}
                    alt={u.displayName}
                    class="w-8 h-8 rounded-full shrink-0"
                  />
                ) : (
                  <div class="w-8 h-8 rounded-full bg-surface-hover text-secondary flex items-center justify-center text-sm font-semibold shrink-0 border border-edge">
                    {initial}
                  </div>
                )}
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-medium text-ink truncate">
                    {u.displayName}
                    {isSelf && (
                      <span class="text-xs text-muted ml-2">({t(locale, "admin.you")})</span>
                    )}
                  </div>
                  <div class="text-xs text-muted truncate">{u.email}</div>
                </div>
                <span
                  class={`text-xs font-semibold px-2 py-0.5 rounded-[var(--radius-sm)] ${
                    isAdmin
                      ? "bg-[var(--color-glow-success)] text-success"
                      : "bg-surface-hover text-muted"
                  }`}
                >
                  {isAdmin ? t(locale, "admin.role.admin") : t(locale, "admin.role.user")}
                </span>
                {isAdmin ? (
                  isLastAdmin ? null : (
                    <button
                      hx-post={`/admin/users/${u.id}/demote${actionSuffix}`}
                      hx-target="#admin-users-list"
                      hx-swap="outerHTML"
                      hx-confirm={t(locale, "admin.confirm.demote")}
                      class="text-xs px-2.5 py-1.5 rounded-[var(--radius-sm)] text-muted hover:text-danger hover:bg-[var(--color-glow-danger)] transition-colors"
                    >
                      {t(locale, "admin.button.demote")}
                    </button>
                  )
                ) : (
                  <button
                    hx-post={`/admin/users/${u.id}/promote${actionSuffix}`}
                    hx-target="#admin-users-list"
                    hx-swap="outerHTML"
                    class="text-xs px-2.5 py-1.5 rounded-[var(--radius-sm)] text-muted hover:text-accent hover:bg-surface-hover transition-colors"
                  >
                    {t(locale, "admin.button.promote")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div class="flex items-center justify-center gap-3 mt-4">
          {page > 1 ? (
            <a
              href={paginatedUrl(page - 1)}
              hx-get={paginatedUrl(page - 1)}
              hx-target="#admin-users-list"
              hx-swap="outerHTML"
              hx-push-url="true"
              class="text-xs px-3 py-1.5 rounded-[var(--radius-sm)] text-accent hover:bg-surface-hover transition-colors"
            >
              {t(locale, "admin.users.prev")}
            </a>
          ) : (
            <span class="text-xs px-3 py-1.5 text-muted">{t(locale, "admin.users.prev")}</span>
          )}
          <span class="text-xs text-secondary">
            {t(locale, "admin.users.pageInfo")
              .replace("{page}", String(page))
              .replace("{totalPages}", String(totalPages))}
          </span>
          {page < totalPages ? (
            <a
              href={paginatedUrl(page + 1)}
              hx-get={paginatedUrl(page + 1)}
              hx-target="#admin-users-list"
              hx-swap="outerHTML"
              hx-push-url="true"
              class="text-xs px-3 py-1.5 rounded-[var(--radius-sm)] text-accent hover:bg-surface-hover transition-colors"
            >
              {t(locale, "admin.users.next")}
            </a>
          ) : (
            <span class="text-xs px-3 py-1.5 text-muted">{t(locale, "admin.users.next")}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminUsersList({
  users: allUsers,
  currentUserId,
  locale,
  page,
  totalPages,
  query,
}: {
  users: User[];
  currentUserId: string;
  locale: string;
  page: number;
  totalPages: number;
  query: string;
}) {
  return (
    <div>
      {/* Search — outside the swap target so it keeps focus */}
      <div class="mb-4">
        <input
          type="search"
          name="q"
          value={query}
          placeholder={t(locale, "admin.users.search")}
          hx-get="/admin/users"
          hx-trigger="input changed delay:300ms, search"
          hx-target="#admin-users-list"
          hx-swap="outerHTML"
          hx-push-url="true"
          hx-include="this"
          hx-vals='{"page":"1"}'
          class="w-full px-4 py-2.5 bg-surface border border-edge rounded-[var(--radius-sm)] text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
        />
      </div>

      <AdminUsersListInner
        users={allUsers}
        currentUserId={currentUserId}
        locale={locale}
        page={page}
        totalPages={totalPages}
        query={query}
      />
    </div>
  );
}

export function AdminUsersPage({
  users: allUsers,
  currentUserId,
  displayName,
  avatarUrl,
  locale,
  theme,
  devMode,
  page,
  totalPages,
  query,
}: {
  users: User[];
  currentUserId: string;
  displayName: string;
  avatarUrl?: string | null;
  locale: string;
  theme?: string;
  devMode?: boolean;
  page: number;
  totalPages: number;
  query: string;
}) {
  return (
    <Layout title={t(locale, "admin.users.title")} locale={locale} theme={theme} devMode={devMode}>
      <Nav displayName={displayName} avatarUrl={avatarUrl} locale={locale} theme={theme} isAdmin />
      <main class="max-w-3xl mx-auto px-6 py-10">
        <AdminTabs current="users" locale={locale} />
        <div class="mb-8">
          <h1 class="text-xl font-bold text-ink tracking-tight mb-1">
            {t(locale, "admin.users.title")}
          </h1>
          <p class="text-sm text-secondary">{t(locale, "admin.users.description")}</p>
        </div>
        <AdminUsersList
          users={allUsers}
          currentUserId={currentUserId}
          locale={locale}
          page={page}
          totalPages={totalPages}
          query={query}
        />
      </main>
    </Layout>
  );
}
