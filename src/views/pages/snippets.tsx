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
  activeMentionedUsers: string[];
  activeMentionedUsergroups: string[];
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
        onchange={`(function(el){var v=el.value;var url=new window.URL(window.location.href);if(v){url.searchParams.set('${name}',v)}else{url.searchParams.delete('${name}')}url.searchParams.delete('page');htmx.ajax('GET',url.pathname+url.search,{target:'#snippets-content',swap:'innerHTML'});history.pushState(null,'',url.pathname+url.search)})(this)`}
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

function MultiSelectFilter({
  name,
  label,
  options,
  activeValues,
  searchPlaceholder,
}: {
  name: string;
  label: string;
  options: FilterOption[];
  activeValues: string[];
  searchPlaceholder: string;
}) {
  if (options.length === 0) return null;

  const activeSet = new Set(activeValues);
  const selectedOptions = options.filter((o) => activeSet.has(o.id));
  const instanceId = `ms-${name}`;

  // Build the init script for the multi-select.
  // It wires up fuzzy search, toggling, and URL sync.
  const initScript = `(function(){var w=document.getElementById('${instanceId}');if(!w)return;var input=w.querySelector('.ms-input');var list=w.querySelector('.ms-list');var sel=JSON.parse(w.dataset.selected||'[]');function fuzzy(q,t){q=q.toLowerCase();t=t.toLowerCase();var qi=0;for(var ti=0;ti<t.length&&qi<q.length;ti++){if(t[ti]===q[qi])qi++}return qi===q.length}function render(){var q=input.value;list.innerHTML='';var opts=JSON.parse(w.dataset.options||'[]');opts.forEach(function(o){if(sel.indexOf(o.id)!==-1)return;if(q&&!fuzzy(q,o.label))return;var li=document.createElement('button');li.type='button';li.className='w-full text-left px-2.5 py-1.5 text-sm text-ink hover:bg-surface-hover cursor-pointer';li.textContent=o.label;li.onmousedown=function(e){e.preventDefault();sel.push(o.id);input.value='';sync();render()};list.appendChild(li)})}function sync(){var url=new URL(window.location.href);if(sel.length>0){url.searchParams.set('${name}',sel.join(','))}else{url.searchParams.delete('${name}')}url.searchParams.delete('page');htmx.ajax('GET',url.pathname+url.search,{target:'#snippets-content',swap:'innerHTML'});history.pushState(null,'',url.pathname+url.search)}input.addEventListener('input',render);input.addEventListener('focus',function(){list.style.display='block';render()});document.addEventListener('click',function(e){if(!w.contains(e.target)){list.style.display='none'}});w.querySelectorAll('.ms-remove').forEach(function(btn){btn.addEventListener('click',function(){var id=btn.dataset.id;sel=sel.filter(function(s){return s!==id});sync()})});render()})()`;

  return (
    <div class="flex flex-col gap-1">
      <label class="text-xs text-muted font-medium">{label}</label>
      <div
        id={instanceId}
        class="relative"
        data-selected={JSON.stringify(activeValues)}
        data-options={JSON.stringify(options.map((o) => ({ id: o.id, label: o.label })))}
      >
        {selectedOptions.length > 0 && (
          <div class="flex flex-wrap gap-1 mb-1">
            {selectedOptions.map((opt) => (
              <span
                key={opt.id}
                class="inline-flex items-center gap-1 px-2 py-0.5 bg-surface border border-edge rounded-full text-xs text-ink"
              >
                {opt.label}
                <button
                  type="button"
                  class="ms-remove text-muted hover:text-danger cursor-pointer"
                  data-id={opt.id}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          type="text"
          placeholder={searchPlaceholder}
          class="ms-input w-full bg-surface border border-edge rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent"
          autocomplete="off"
        />
        <div
          class="ms-list absolute z-20 left-0 right-0 top-full mt-1 bg-surface border border-edge rounded-[var(--radius-sm)] shadow-lg max-h-48 overflow-y-auto"
          style="display:none"
        />
        <script dangerouslySetInnerHTML={{ __html: initScript }} />
      </div>
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
  activeMentionedUsers,
  activeMentionedUsergroups,
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
    if (activePostedBy) params.set("postedBy", activePostedBy);
    if (activeMentionedUsers.length > 0) params.set("user", activeMentionedUsers.join(","));
    if (activeMentionedUsergroups.length > 0)
      params.set("usergroup", activeMentionedUsergroups.join(","));
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
        <MultiSelectFilter
          name="user"
          label={t(locale, "snippets.filter.mentionedUser")}
          options={mentionedUsers}
          activeValues={activeMentionedUsers}
          searchPlaceholder={t(locale, "owners.searchPlaceholder")}
        />
        <MultiSelectFilter
          name="usergroup"
          label={t(locale, "snippets.filter.mentionedUsergroup")}
          options={mentionedUsergroups}
          activeValues={activeMentionedUsergroups}
          searchPlaceholder={t(locale, "owners.searchPlaceholder")}
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
            if (activeMentionedUsers.length > 0) params.set("user", activeMentionedUsers.join(","));
            if (activeMentionedUsergroups.length > 0)
              params.set("usergroup", activeMentionedUsergroups.join(","));
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
