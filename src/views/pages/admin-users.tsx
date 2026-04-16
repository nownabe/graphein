import type { InferSelectModel } from "drizzle-orm";
import type { users } from "../../db/schema";
import { t } from "../../i18n/index";
import { Layout } from "../layout";
import { Nav } from "../components/nav";
import { AdminTabs } from "../components/admin-tabs";

type User = InferSelectModel<typeof users>;

export function AdminUsersList({
  users: allUsers,
  currentUserId,
  locale,
}: {
  users: User[];
  currentUserId: string;
  locale: string;
}) {
  const adminCount = allUsers.filter((u) => u.role === "admin").length;
  return (
    <ul
      id="admin-users-list"
      class="bg-surface border border-edge rounded-[var(--radius-lg)] divide-y divide-edge"
    >
      {allUsers.map((u) => {
        const isAdmin = u.role === "admin";
        const isSelf = u.id === currentUserId;
        const isLastAdmin = isAdmin && adminCount <= 1;
        return (
          <li key={u.id} class="flex items-center gap-3 px-5 py-4">
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium text-ink truncate">
                {u.displayName}
                {isSelf && <span class="text-xs text-muted ml-2">({t(locale, "admin.you")})</span>}
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
                  hx-post={`/admin/users/${u.id}/demote`}
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
                hx-post={`/admin/users/${u.id}/promote`}
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
}: {
  users: User[];
  currentUserId: string;
  displayName: string;
  avatarUrl?: string | null;
  locale: string;
  theme?: string;
  devMode?: boolean;
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
        <AdminUsersList users={allUsers} currentUserId={currentUserId} locale={locale} />
      </main>
    </Layout>
  );
}
