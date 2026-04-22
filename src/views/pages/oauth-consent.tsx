import { t } from "../../i18n/index";
import { Layout } from "../layout";

export function OAuthConsentPage({
  clientName,
  redirectUri,
  scope: _scope,
  requestToken,
  locale,
  theme,
  devMode,
}: {
  clientName: string;
  redirectUri: string;
  scope: string;
  requestToken: string;
  locale: string;
  theme?: string;
  devMode?: boolean;
}) {
  return (
    <Layout
      title={t(locale, "oauth.consent.title")}
      locale={locale}
      theme={theme}
      devMode={devMode}
    >
      <div class="min-h-screen flex items-center justify-center relative overflow-hidden bg-page">
        {/* Ambient accent glow */}
        <div
          class="absolute inset-0 pointer-events-none"
          style="background: radial-gradient(ellipse 500px 350px at 50% 45%, rgba(124,138,255,0.08) 0%, transparent 100%);"
        />
        {/* Grid pattern */}
        <div
          class="absolute inset-0 pointer-events-none opacity-[0.03]"
          style="background-image: linear-gradient(var(--color-edge) 1px, transparent 1px), linear-gradient(90deg, var(--color-edge) 1px, transparent 1px); background-size: 60px 60px;"
        />
        <div class="relative w-full max-w-md mx-4 stagger-in">
          <div class="bg-surface border border-edge rounded-[var(--radius-lg)] p-8">
            {/* App icon */}
            <div class="w-12 h-12 rounded-[var(--radius-sm)] bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-6">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" class="text-accent">
                <path
                  d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>

            {/* Client name */}
            <h1 class="text-xl font-bold text-ink text-center mb-2">
              <span class="text-accent">{clientName}</span>
            </h1>

            {/* Description */}
            <p class="text-secondary text-sm text-center mb-6">
              {t(locale, "oauth.consent.description")}
            </p>

            {/* Permissions */}
            <div class="mb-4">
              <div class="text-xs font-medium text-muted uppercase tracking-wider mb-2">
                {t(locale, "oauth.consent.permissions")}
              </div>
              <div class="bg-page border border-edge rounded-[var(--radius-sm)] px-4 py-3 flex items-center gap-3">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  class="text-success shrink-0"
                >
                  <path
                    d="M13.5 4.5L6 12 2.5 8.5"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                <span class="text-sm text-ink">{t(locale, "oauth.consent.scopeDescription")}</span>
              </div>
            </div>

            {/* Redirect URI */}
            <div class="mb-6">
              <div class="text-xs font-medium text-muted uppercase tracking-wider mb-2">
                {t(locale, "oauth.consent.redirectUri")}
              </div>
              <div class="bg-page border border-edge rounded-[var(--radius-sm)] px-4 py-3">
                <code class="text-xs text-secondary break-all">{redirectUri}</code>
              </div>
            </div>

            {/* Actions */}
            <div class="flex gap-3">
              <form method="post" action="/oauth/consent" class="flex-1">
                <input type="hidden" name="decision" value="deny" />
                <input type="hidden" name="request_token" value={requestToken} />
                <button
                  type="submit"
                  class="w-full px-4 py-2.5 rounded-[var(--radius-sm)] text-sm font-medium bg-page border border-edge text-secondary hover:bg-surface hover:text-ink transition-colors cursor-pointer"
                >
                  {t(locale, "oauth.consent.deny")}
                </button>
              </form>
              <form method="post" action="/oauth/consent" class="flex-1">
                <input type="hidden" name="decision" value="approve" />
                <input type="hidden" name="request_token" value={requestToken} />
                <button
                  type="submit"
                  class="w-full px-4 py-2.5 rounded-[var(--radius-sm)] text-sm font-bold bg-accent text-page hover:bg-accent-hover transition-colors cursor-pointer"
                >
                  {t(locale, "oauth.consent.approve")}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
