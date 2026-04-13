import type { SnippetWithAuthor } from "../../snippets/service";
import type { PeriodType } from "../../snippets/period";
import type { MrkdwnOptions } from "../../slack/mrkdwn";
import { t } from "../../i18n/index";
import { Layout } from "../layout";
import { Nav } from "../components/nav";
import { SnippetCard } from "../components/snippet-card";

interface FilterOption {
  id: string;
  label: string;
}

interface SnippetsPageProps {
  snippets: SnippetWithAuthor[];
  total: number;
  displayName: string;
  locale: string;
  theme?: string;
  isAdmin?: boolean;
  devMode?: boolean;
  period: PeriodType;
  periodLabel: string;
  prevDate: string;
  nextDate: string;
  currentDate: string;
  posters: FilterOption[];
  mentionedUsers: FilterOption[];
  mentionedUsergroups: FilterOption[];
  activePostedBy?: string;
  activeMentionedUser?: string;
  activeMentionedUsergroup?: string;
  page: number;
  totalPages: number;
  mrkdwnLabels?: MrkdwnOptions;
}

function PeriodTabs({
  activePeriod,
  locale,
  buildUrl,
}: {
  activePeriod: PeriodType;
  locale: string;
  buildUrl: (params: Record<string, string>) => string;
}) {
  const periods: { key: PeriodType; label: string }[] = [
    { key: "day", label: t(locale, "snippets.period.day") },
    { key: "week", label: t(locale, "snippets.period.week") },
    { key: "month", label: t(locale, "snippets.period.month") },
    { key: "quarter", label: t(locale, "snippets.period.quarter") },
    { key: "year", label: t(locale, "snippets.period.year") },
  ];

  return (
    <div class="inline-flex bg-surface rounded-[var(--radius-sm)] p-0.5 border border-edge">
      {periods.map((p) => {
        const isActive = p.key === activePeriod;
        const href = buildUrl({ period: p.key });
        return (
          <a
            key={p.key}
            href={href}
            hx-get={href}
            hx-target="#snippets-content"
            hx-swap="innerHTML"
            hx-push-url={href}
            class={`px-3 py-1.5 text-xs font-semibold rounded-[6px] transition-all ${
              isActive ? "bg-accent text-page" : "text-muted hover:text-secondary"
            }`}
          >
            {p.label}
          </a>
        );
      })}
    </div>
  );
}

function FilterSelect({
  name,
  label,
  options,
  activeValue,
  allLabel,
}: {
  name: string;
  label: string;
  options: FilterOption[];
  activeValue?: string;
  allLabel: string;
}) {
  if (options.length === 0) return null;
  return (
    <div class="flex flex-col gap-1">
      <label class="text-xs text-muted font-medium">{label}</label>
      <select
        name={name}
        class="bg-surface border border-edge rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm text-ink cursor-pointer"
        onchange={`(function(el){var v=el.value;var url=new URL(window.location.href);if(v){url.searchParams.set('${name}',v)}else{url.searchParams.delete('${name}')}url.searchParams.delete('page');htmx.ajax('GET',url.pathname+url.search,{target:'#snippets-content',swap:'innerHTML'});history.pushState(null,'',url.pathname+url.search)})(this)`}
      >
        <option value="">{allLabel}</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id} selected={opt.id === activeValue}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SnippetsContentPartial({
  snippets: snippetList,
  total,
  locale,
  period,
  periodLabel,
  prevDate,
  nextDate,
  currentDate,
  posters,
  mentionedUsers,
  mentionedUsergroups,
  activePostedBy,
  activeMentionedUser,
  activeMentionedUsergroup,
  page,
  totalPages,
  mrkdwnLabels,
}: Omit<SnippetsPageProps, "displayName" | "theme" | "isAdmin" | "devMode">) {
  function buildUrl(overrides: Record<string, string> = {}): string {
    const params = new URLSearchParams();
    const p = overrides.period ?? period;
    const d = overrides.date ?? currentDate;
    params.set("period", p);
    params.set("date", d);
    if (!overrides.period && !overrides.date) {
      if (activePostedBy) params.set("postedBy", activePostedBy);
      if (activeMentionedUser) params.set("user", activeMentionedUser);
      if (activeMentionedUsergroup) params.set("usergroup", activeMentionedUsergroup);
    }
    return `/snippets?${params.toString()}`;
  }

  const prevUrl = buildUrl({ date: prevDate });
  const nextUrl = buildUrl({ date: nextDate });

  return (
    <>
      <div class="mb-6">
        <PeriodTabs activePeriod={period} locale={locale} buildUrl={buildUrl} />
      </div>

      <div class="flex items-center justify-between mb-6">
        <a
          href={prevUrl}
          hx-get={prevUrl}
          hx-target="#snippets-content"
          hx-swap="innerHTML"
          hx-push-url={prevUrl}
          class="text-sm text-muted hover:text-accent transition-colors"
          title={t(locale, "snippets.prev")}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10.354 3.354a.5.5 0 00-.708-.708l-5 5a.5.5 0 000 .708l5 5a.5.5 0 00.708-.708L5.707 8l4.647-4.646z" />
          </svg>
        </a>
        <span class="text-sm font-semibold text-ink">{periodLabel}</span>
        <a
          href={nextUrl}
          hx-get={nextUrl}
          hx-target="#snippets-content"
          hx-swap="innerHTML"
          hx-push-url={nextUrl}
          class="text-sm text-muted hover:text-accent transition-colors"
          title={t(locale, "snippets.next")}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.646 3.354a.5.5 0 01.708-.708l5 5a.5.5 0 010 .708l-5 5a.5.5 0 01-.708-.708L10.293 8 5.646 3.354z" />
          </svg>
        </a>
      </div>

      <div class="flex flex-wrap gap-4 mb-6">
        <FilterSelect
          name="postedBy"
          label={t(locale, "snippets.filter.postedBy")}
          options={posters}
          activeValue={activePostedBy}
          allLabel={t(locale, "snippets.filter.all")}
        />
        <FilterSelect
          name="user"
          label={t(locale, "snippets.filter.mentionedUser")}
          options={mentionedUsers}
          activeValue={activeMentionedUser}
          allLabel={t(locale, "snippets.filter.all")}
        />
        <FilterSelect
          name="usergroup"
          label={t(locale, "snippets.filter.mentionedUsergroup")}
          options={mentionedUsergroups}
          activeValue={activeMentionedUsergroup}
          allLabel={t(locale, "snippets.filter.all")}
        />
      </div>

      <p class="text-sm text-secondary mb-6">
        {total} {total === 1 ? "snippet" : "snippets"}
      </p>

      {snippetList.length === 0 ? (
        <p class="text-center text-muted py-16 whitespace-pre-line">
          {t(locale, "snippets.empty")}
        </p>
      ) : (
        <div class="space-y-4">
          {snippetList.map((s) => (
            <SnippetCard key={s.id} snippet={s} locale={locale} mrkdwnLabels={mrkdwnLabels} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div class="flex justify-center gap-2 mt-8">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
            const params = new URLSearchParams();
            params.set("period", period);
            params.set("date", currentDate);
            if (activePostedBy) params.set("postedBy", activePostedBy);
            if (activeMentionedUser) params.set("user", activeMentionedUser);
            if (activeMentionedUsergroup) params.set("usergroup", activeMentionedUsergroup);
            if (p > 1) params.set("page", String(p));
            const href = `/snippets?${params.toString()}`;
            return (
              <a
                key={p}
                href={href}
                hx-get={href}
                hx-target="#snippets-content"
                hx-swap="innerHTML"
                hx-push-url={href}
                class={`px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-sm)] transition-colors ${
                  p === page
                    ? "bg-accent text-page"
                    : "bg-surface border border-edge text-muted hover:text-ink"
                }`}
              >
                {p}
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}

export function SnippetsPage(props: SnippetsPageProps) {
  const { displayName, locale, theme, isAdmin, devMode, ...contentProps } = props;
  return (
    <Layout title={t(locale, "page.snippets")} locale={locale} theme={theme} devMode={devMode}>
      <Nav displayName={displayName} locale={locale} theme={theme} isAdmin={isAdmin} />
      <main class="max-w-3xl mx-auto px-6 py-10">
        <div class="mb-6">
          <h1 class="text-xl font-bold text-ink tracking-tight">{t(locale, "page.snippets")}</h1>
        </div>
        <div id="snippets-content">
          <SnippetsContentPartial {...contentProps} locale={locale} />
        </div>
      </main>
    </Layout>
  );
}
