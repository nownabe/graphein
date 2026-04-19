import { t } from "../../i18n/index";
import { Layout } from "../layout";
import { Nav } from "../components/nav";

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  role: string;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

function formatDate(date: Date | null): string {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function ApiKeyCreatedBanner({ rawKey, locale }: { rawKey: string; locale: string }) {
  return (
    <div
      id="api-key-created-banner"
      class="mb-6 bg-success/10 border border-success/30 rounded-[var(--radius-sm)] p-4"
    >
      <div class="flex items-start gap-3">
        <svg class="w-5 h-5 text-success shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
          <path
            fill-rule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
            clip-rule="evenodd"
          />
        </svg>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-success mb-1">{t(locale, "apiKeys.created.title")}</p>
          <p class="text-xs text-muted mb-3">{t(locale, "apiKeys.created.warning")}</p>
          <div class="flex items-center gap-2">
            <code
              id="raw-key-value"
              class="flex-1 text-xs font-mono bg-page px-3 py-2 rounded-[var(--radius-sm)] border border-edge text-ink break-all select-all"
            >
              {rawKey}
            </code>
            <button
              type="button"
              onclick="(function(){var k=document.getElementById('raw-key-value');navigator.clipboard.writeText(k.textContent.trim());var b=event.currentTarget;b.querySelector('.copy-icon').style.display='none';b.querySelector('.check-icon').style.display='block';setTimeout(function(){b.querySelector('.copy-icon').style.display='block';b.querySelector('.check-icon').style.display='none'},2000)})()"
              class="shrink-0 p-2 rounded-[var(--radius-sm)] bg-surface hover:bg-surface-hover border border-edge text-secondary hover:text-ink transition-colors cursor-pointer"
              title={t(locale, "apiKeys.copy")}
            >
              <svg
                class="copy-icon w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
              <svg
                class="check-icon w-4 h-4 text-success"
                style="display:none"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ApiKeyCreateForm({ locale, isAdmin }: { locale: string; isAdmin: boolean }) {
  return (
    <form
      hx-post="/settings/api-keys"
      hx-target="#api-keys-content"
      hx-swap="innerHTML"
      {...{ "hx-on::after-request": "if(event.detail.successful) this.reset()" }}
      class="bg-surface border border-edge rounded-[var(--radius-lg)] p-5 mb-6"
    >
      <h3 class="text-sm font-semibold text-ink mb-4">{t(locale, "apiKeys.create.title")}</h3>
      <div class="flex flex-col gap-4">
        <div>
          <label class="block text-xs font-medium text-secondary mb-1.5">
            {t(locale, "apiKeys.create.name")}
          </label>
          <input
            type="text"
            name="name"
            required
            maxlength={100}
            placeholder={t(locale, "apiKeys.create.namePlaceholder")}
            class="w-full px-3 py-2 text-sm bg-page border border-edge rounded-[var(--radius-sm)] text-ink placeholder:text-muted focus:outline-none focus:border-accent"
          />
        </div>
        <div class="flex flex-col sm:flex-row gap-4">
          <div class="flex-1">
            <label class="block text-xs font-medium text-secondary mb-1.5">
              {t(locale, "apiKeys.create.expiration")}
            </label>
            <select
              name="expiration"
              class="w-full px-3 py-2 text-sm bg-page border border-edge rounded-[var(--radius-sm)] text-ink focus:outline-none focus:border-accent cursor-pointer"
            >
              <option value="90">{t(locale, "apiKeys.expiration.90days")}</option>
              <option value="30">{t(locale, "apiKeys.expiration.30days")}</option>
              <option value="7">{t(locale, "apiKeys.expiration.7days")}</option>
              <option value="never">{t(locale, "apiKeys.expiration.never")}</option>
            </select>
          </div>
          {isAdmin && (
            <div class="flex-1">
              <label class="block text-xs font-medium text-secondary mb-1.5">
                {t(locale, "apiKeys.create.role")}
              </label>
              <select
                name="role"
                class="w-full px-3 py-2 text-sm bg-page border border-edge rounded-[var(--radius-sm)] text-ink focus:outline-none focus:border-accent cursor-pointer"
              >
                <option value="user">{t(locale, "apiKeys.role.user")}</option>
                <option value="admin">{t(locale, "apiKeys.role.admin")}</option>
              </select>
            </div>
          )}
        </div>
        <div>
          <button
            type="submit"
            class="px-4 py-2 text-sm font-medium bg-accent text-page rounded-[var(--radius-sm)] hover:opacity-90 transition-opacity cursor-pointer"
          >
            {t(locale, "apiKeys.create.submit")}
          </button>
        </div>
      </div>
    </form>
  );
}

export function ApiKeysList({
  keys,
  locale,
  error,
}: {
  keys: ApiKeyRow[];
  locale: string;
  error?: string;
}) {
  return (
    <div id="api-keys-list">
      {error && (
        <div class="mb-4 bg-danger/10 border border-danger/30 rounded-[var(--radius-sm)] px-4 py-3 text-sm text-danger">
          {t(locale, error)}
        </div>
      )}
      {keys.length === 0 ? (
        <div class="bg-surface border border-edge rounded-[var(--radius-lg)] px-5 py-8 text-center text-sm text-muted">
          {t(locale, "apiKeys.empty")}
        </div>
      ) : (
        <div class="bg-surface border border-edge rounded-[var(--radius-lg)] divide-y divide-edge">
          {keys.map((key) => {
            const isRevoked = key.revokedAt != null;
            const isExpired = key.expiresAt != null && key.expiresAt <= new Date();
            const isInactive = isRevoked || isExpired;

            return (
              <div
                key={key.id}
                class={`flex items-center gap-4 px-5 py-4${isInactive ? " opacity-50" : ""}`}
              >
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-sm font-medium text-ink truncate">{key.name}</span>
                    <span class="text-xs font-mono text-muted">{key.keyPrefix}...</span>
                    {key.role === "admin" && (
                      <span class="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-accent/15 text-accent">
                        {t(locale, "apiKeys.role.admin")}
                      </span>
                    )}
                    {isRevoked && (
                      <span class="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-danger/15 text-danger">
                        {t(locale, "apiKeys.status.revoked")}
                      </span>
                    )}
                    {!isRevoked && isExpired && (
                      <span class="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-danger/15 text-danger">
                        {t(locale, "apiKeys.status.expired")}
                      </span>
                    )}
                  </div>
                  <div class="flex items-center gap-4 text-xs text-muted">
                    <span>
                      {t(locale, "apiKeys.createdAt")}: {formatDate(key.createdAt)}
                    </span>
                    {key.expiresAt && (
                      <span>
                        {t(locale, "apiKeys.expiresAt")}: {formatDate(key.expiresAt)}
                      </span>
                    )}
                    {key.lastUsedAt && (
                      <span>
                        {t(locale, "apiKeys.lastUsedAt")}: {formatDate(key.lastUsedAt)}
                      </span>
                    )}
                  </div>
                </div>
                {!isRevoked && (
                  <button
                    type="button"
                    hx-post={`/settings/api-keys/${key.id}/revoke`}
                    hx-target="#api-keys-list"
                    hx-swap="outerHTML"
                    hx-confirm={t(locale, "apiKeys.confirm.revoke")}
                    class="shrink-0 px-3 py-1.5 text-xs font-medium text-danger border border-danger/30 rounded-[var(--radius-sm)] hover:bg-glow-danger transition-colors cursor-pointer"
                  >
                    {t(locale, "apiKeys.revoke")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ApiKeysPage({
  keys,
  displayName,
  avatarUrl,
  locale,
  theme,
  isAdmin,
  devMode,
}: {
  keys: ApiKeyRow[];
  displayName: string;
  avatarUrl: string | null;
  locale: string;
  theme: string;
  isAdmin: boolean;
  devMode: boolean;
}) {
  return (
    <Layout title={t(locale, "apiKeys.title")} locale={locale} theme={theme} devMode={devMode}>
      <Nav
        displayName={displayName}
        avatarUrl={avatarUrl}
        locale={locale}
        theme={theme}
        isAdmin={isAdmin}
      />
      <main class="max-w-3xl mx-auto px-6 py-10">
        <h1 class="text-xl font-bold text-ink mb-2">{t(locale, "apiKeys.title")}</h1>
        <p class="text-sm text-muted mb-8">{t(locale, "apiKeys.description")}</p>

        <ApiKeyCreateForm locale={locale} isAdmin={isAdmin} />

        <div id="api-keys-content">
          <ApiKeysList keys={keys} locale={locale} />
        </div>
      </main>
    </Layout>
  );
}
