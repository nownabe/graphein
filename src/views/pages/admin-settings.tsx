import { t } from "../../i18n/index";
import { Layout } from "../layout";
import { Nav } from "../components/nav";
import { AdminTabs } from "../components/admin-tabs";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

function monthLabel(month: number, locale: string): string {
  const date = new Date(2000, month - 1, 1);
  return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", { month: "long" }).format(
    date,
  );
}

export function AdminSettingsForm({
  fiscalQuarterStartMonth,
  fiscalYearLabel,
  locale,
}: {
  fiscalQuarterStartMonth: number;
  fiscalYearLabel: string;
  locale: string;
}) {
  return (
    <div id="settings-form" class="space-y-6">
      <form
        hx-post="/admin/settings/fiscal-quarter"
        hx-target="#settings-form"
        hx-swap="outerHTML"
        class="flex items-end gap-3"
      >
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-secondary">
            {t(locale, "admin.settings.fiscalQuarterStartMonth")}
          </label>
          <select
            name="fiscal_quarter_start_month"
            class="bg-surface border border-edge rounded-[var(--radius-sm)] px-3 py-2 text-sm text-ink cursor-pointer"
          >
            {MONTHS.map((m) => (
              <option key={m} value={m} selected={m === fiscalQuarterStartMonth}>
                {monthLabel(m, locale)}
              </option>
            ))}
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-secondary">
            {t(locale, "admin.settings.fiscalYearLabel")}
          </label>
          <select
            name="fiscal_year_label"
            class="bg-surface border border-edge rounded-[var(--radius-sm)] px-3 py-2 text-sm text-ink cursor-pointer"
          >
            <option value="start" selected={fiscalYearLabel === "start"}>
              {t(locale, "admin.settings.fiscalYearLabel.start")}
            </option>
            <option value="end" selected={fiscalYearLabel === "end"}>
              {t(locale, "admin.settings.fiscalYearLabel.end")}
            </option>
          </select>
        </div>
        <button
          type="submit"
          class="px-4 py-2 bg-accent text-page text-sm font-semibold rounded-[var(--radius-sm)] hover:opacity-90 transition-opacity cursor-pointer"
        >
          {t(locale, "button.save")}
        </button>
      </form>
      <p class="mt-2 text-xs text-muted">{t(locale, "admin.settings.fiscalQuarterDescription")}</p>
      <p class="text-xs text-muted">{t(locale, "admin.settings.fiscalYearLabelDescription")}</p>
    </div>
  );
}

export function AdminSettingsPage({
  fiscalQuarterStartMonth,
  fiscalYearLabel,
  displayName,
  locale,
  theme,
  devMode,
}: {
  fiscalQuarterStartMonth: number;
  fiscalYearLabel: string;
  displayName: string;
  locale: string;
  theme?: string;
  devMode?: boolean;
}) {
  return (
    <Layout
      title={t(locale, "admin.settings.title")}
      locale={locale}
      theme={theme}
      devMode={devMode}
    >
      <Nav displayName={displayName} locale={locale} theme={theme} isAdmin />
      <main class="max-w-3xl mx-auto px-6 py-10">
        <AdminTabs current="settings" locale={locale} />
        <div class="mb-8">
          <h1 class="text-xl font-bold text-ink tracking-tight mb-1">
            {t(locale, "admin.settings.title")}
          </h1>
          <p class="text-sm text-secondary">{t(locale, "admin.settings.description")}</p>
        </div>
        <AdminSettingsForm
          fiscalQuarterStartMonth={fiscalQuarterStartMonth}
          fiscalYearLabel={fiscalYearLabel}
          locale={locale}
        />
      </main>
    </Layout>
  );
}
