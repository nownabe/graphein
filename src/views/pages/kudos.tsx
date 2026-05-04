import type { KudosEntryWithContext } from "../../kudos/service";
import type { PeriodType } from "../../snippets/period";
import type { MrkdwnOptions } from "../../adapters/slack/mrkdwn";
import { t } from "../../i18n/index";
import { Layout } from "../layout";
import { Nav } from "../components/nav";
import { KudosCard } from "../components/kudos-card";

interface FilterOption {
  id: string;
  label: string;
}

interface KudosPageProps {
  entries: KudosEntryWithContext[];
  total: number;
  displayName: string;
  avatarUrl?: string | null;
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
  activePostedBy?: string;
  activeMentionedUser?: string;
  page: number;
  totalPages: number;
  mrkdwnLabels?: MrkdwnOptions;
  isNextDisabled?: boolean;
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
    { key: "day", label: t(locale, "kudos.period.day") },
    { key: "week", label: t(locale, "kudos.period.week") },
    { key: "month", label: t(locale, "kudos.period.month") },
    { key: "quarter", label: t(locale, "kudos.period.quarter") },
    { key: "year", label: t(locale, "kudos.period.year") },
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
            hx-target="#kudos-content"
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

function SingleSelectFilter({
  name,
  label,
  options,
  activeValue,
  allLabel,
  searchPlaceholder,
  noResultsLabel,
}: {
  name: string;
  label: string;
  options: FilterOption[];
  activeValue?: string;
  allLabel: string;
  searchPlaceholder: string;
  noResultsLabel: string;
}) {
  if (options.length === 0) return null;

  const instanceId = `kudos-ss-${name}`;
  const selectedOption = options.find((o) => o.id === activeValue);
  const displayLabel = selectedOption ? selectedOption.label : allLabel;
  const hasSelection = !!activeValue;

  const allLabelEscaped = allLabel.replace(/'/g, "\\'");
  const noResultsEscaped = noResultsLabel.replace(/'/g, "\\'");
  const initScript = [
    `(function(){`,
    `var w=document.getElementById('${instanceId}');if(!w)return;`,
    `var btn=w.querySelector('.ss-trigger');`,
    `var pop=w.querySelector('.ss-popover');`,
    `var input=w.querySelector('.ss-search');`,
    `var list=w.querySelector('.ss-list');`,
    `var activeVal=w.dataset.active||'';`,
    `var open=false;`,
    `function fuzzy(q,t){q=q.toLowerCase();t=t.toLowerCase();`,
    `var qi=0;for(var ti=0;ti<t.length&&qi<q.length;ti++){if(t[ti]===q[qi])qi++}return qi===q.length}`,
    `function close(){open=false;pop.style.display='none';btn.setAttribute('aria-expanded','false')}`,
    `function toggle(){`,
    `if(!open){document.dispatchEvent(new CustomEvent('kudosFilterClose',{detail:{except:'${instanceId}'}}))}`,
    `open=!open;pop.style.display=open?'block':'none';btn.setAttribute('aria-expanded',String(open));`,
    `if(open){input.value='';render();input.focus()}}`,
    `function select(v){var url=new window.URL(window.location.href);`,
    `url.searchParams.set('${name}',v);`,
    `url.searchParams.delete('page');`,
    `document.querySelectorAll('[id^="kudos-ss-"]').forEach(function(el){`,
    `var n=el.id.replace('kudos-ss-','');`,
    `if(!url.searchParams.has(n)){url.searchParams.set(n,el.dataset.active||'')}});`,
    `htmx.ajax('GET',url.pathname+url.search,{target:'#kudos-content',swap:'innerHTML'});`,
    `history.pushState(null,'',url.pathname+url.search)}`,
    `function render(){var q=input.value;list.innerHTML='';var count=0;`,
    `var opts=JSON.parse(w.dataset.options||'[]');`,
    `if(!q){count++;var allBtn=document.createElement('button');allBtn.type='button';`,
    `allBtn.className='w-full flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-surface-hover transition-colors';`,
    `var allCheck=document.createElement('span');allCheck.className='w-4 flex-shrink-0 text-accent';`,
    `allCheck.innerHTML=!activeVal?'<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2"`,
    ` stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 7.5L5.5 10.5L11.5 3.5"/></svg>':'';`,
    `var allSpan=document.createElement('span');`,
    `allSpan.className=!activeVal?'text-ink font-medium':'text-secondary';`,
    `allSpan.textContent='${allLabelEscaped}';allBtn.appendChild(allCheck);allBtn.appendChild(allSpan);`,
    `allBtn.addEventListener('click',function(ev){ev.stopPropagation();select('')});`,
    `list.appendChild(allBtn)}`,
    `opts.forEach(function(o){if(q&&!fuzzy(q,o.label))return;count++;`,
    `var checked=o.id===activeVal;`,
    `var item=document.createElement('button');item.type='button';`,
    `item.className='w-full flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-surface-hover transition-colors';`,
    `var check=document.createElement('span');check.className='w-4 flex-shrink-0 text-accent';`,
    `check.innerHTML=checked?'<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2"`,
    ` stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 7.5L5.5 10.5L11.5 3.5"/></svg>':'';`,
    `var span=document.createElement('span');`,
    `span.className=checked?'text-ink font-medium':'text-secondary';`,
    `span.textContent=o.label;item.appendChild(check);item.appendChild(span);`,
    `item.addEventListener('click',function(ev){ev.stopPropagation();select(o.id)});`,
    `list.appendChild(item)});`,
    `if(count===0&&q){var empty=document.createElement('div');`,
    `empty.className='px-3 py-2 text-sm text-muted';`,
    `empty.textContent='${noResultsEscaped}';list.appendChild(empty)}}`,
    `btn.addEventListener('click',function(e){e.stopPropagation();toggle()});`,
    `input.addEventListener('input',render);`,
    `document.addEventListener('click',function(e){if(open&&!w.contains(e.target)){close()}});`,
    `document.addEventListener('keydown',function(e){if(e.key==='Escape'&&open){close();btn.focus()}});`,
    `document.addEventListener('kudosFilterClose',function(e){`,
    `if(e.detail&&e.detail.except!=='${instanceId}'&&open){close()}})`,
    `})()`,
  ].join("");
  return (
    <div class="flex flex-col gap-1.5">
      <span class="text-xs font-semibold text-secondary uppercase tracking-wider">{label}</span>
      <div
        id={instanceId}
        class="relative"
        data-active={activeValue ?? ""}
        data-options={JSON.stringify(options.map((o) => ({ id: o.id, label: o.label })))}
      >
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded="false"
          class="ss-trigger flex items-center gap-1.5 bg-page border border-edge rounded-[var(--radius-sm)] pl-2.5 pr-2 py-2 text-sm cursor-pointer hover:border-muted transition-colors h-9"
          style="min-width:140px"
        >
          <span class={`truncate flex-1 text-left ${hasSelection ? "text-ink" : "text-muted"}`}>
            {displayLabel}
          </span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="text-muted flex-shrink-0"
          >
            <path d="M3 4.5L6 7.5L9 4.5" />
          </svg>
        </button>
        <div
          class="ss-popover absolute z-10 left-0 top-full mt-1 w-64 bg-surface border border-edge rounded-[var(--radius-sm)] overflow-hidden"
          style="display:none;box-shadow:0 8px 24px rgba(0,0,0,0.15)"
        >
          <div class="p-2 border-b border-edge">
            <input
              type="text"
              placeholder={searchPlaceholder}
              class="ss-search w-full bg-page border border-edge rounded-[6px] px-2.5 py-1.5 text-sm text-ink placeholder:text-muted"
              autocomplete="off"
            />
          </div>
          <div class="ss-list max-h-48 overflow-y-auto py-1" />
        </div>
        <script dangerouslySetInnerHTML={{ __html: initScript }} />
      </div>
    </div>
  );
}

export function KudosContentPartial({
  entries,
  total,
  locale,
  period,
  periodLabel,
  prevDate,
  nextDate,
  currentDate,
  posters,
  mentionedUsers,
  activePostedBy,
  activeMentionedUser,
  page,
  totalPages,
  mrkdwnLabels,
  isNextDisabled,
}: Omit<KudosPageProps, "displayName" | "theme" | "isAdmin" | "devMode" | "avatarUrl">) {
  function buildUrl(overrides: Record<string, string> = {}): string {
    const params = new URLSearchParams();
    const p = overrides.period ?? period;
    const d = overrides.date ?? currentDate;
    params.set("period", p);
    params.set("date", d);
    params.set("postedBy", activePostedBy ?? "");
    params.set("user", activeMentionedUser ?? "");
    return `/kudos?${params.toString()}`;
  }

  const hasActiveFilters = !!activePostedBy || !!activeMentionedUser;

  const prevUrl = buildUrl({ date: prevDate });
  const nextUrl = buildUrl({ date: nextDate });

  return (
    <>
      <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
        <PeriodTabs activePeriod={period} locale={locale} buildUrl={buildUrl} />
        <div class="flex items-center gap-3">
          <a
            href={prevUrl}
            hx-get={prevUrl}
            hx-target="#kudos-content"
            hx-swap="innerHTML"
            hx-push-url={prevUrl}
            class="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] text-muted hover:text-ink hover:bg-surface-hover transition-colors"
            title={t(locale, "kudos.prev")}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M10.354 3.354a.5.5 0 00-.708-.708l-5 5a.5.5 0 000 .708l5 5a.5.5 0 00.708-.708L5.707 8l4.647-4.646z" />
            </svg>
          </a>
          <span class="text-sm font-semibold text-ink text-center" style="min-width:140px">
            {periodLabel}
          </span>
          {isNextDisabled ? (
            <span
              class="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] text-edge"
              title={t(locale, "kudos.next")}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M5.646 3.354a.5.5 0 01.708-.708l5 5a.5.5 0 010 .708l-5 5a.5.5 0 01-.708-.708L10.293 8 5.646 3.354z" />
              </svg>
            </span>
          ) : (
            <a
              href={nextUrl}
              hx-get={nextUrl}
              hx-target="#kudos-content"
              hx-swap="innerHTML"
              hx-push-url={nextUrl}
              class="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] text-muted hover:text-ink hover:bg-surface-hover transition-colors"
              title={t(locale, "kudos.next")}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M5.646 3.354a.5.5 0 01.708-.708l5 5a.5.5 0 010 .708l-5 5a.5.5 0 01-.708-.708L10.293 8 5.646 3.354z" />
              </svg>
            </a>
          )}
        </div>
      </div>

      <div class="flex flex-wrap items-end gap-4 mb-4 relative z-[5]">
        <SingleSelectFilter
          name="user"
          label={t(locale, "kudos.filter.mentionedUser")}
          options={mentionedUsers}
          activeValue={activeMentionedUser}
          allLabel={t(locale, "kudos.filter.all")}
          searchPlaceholder={t(locale, "kudos.filter.searchUser")}
          noResultsLabel={t(locale, "kudos.filter.noResults")}
        />
        <SingleSelectFilter
          name="postedBy"
          label={t(locale, "kudos.filter.postedBy")}
          options={posters}
          activeValue={activePostedBy}
          allLabel={t(locale, "kudos.filter.all")}
          searchPlaceholder={t(locale, "kudos.filter.searchPoster")}
          noResultsLabel={t(locale, "kudos.filter.noResults")}
        />
        {hasActiveFilters &&
          (() => {
            const resetUrl = (() => {
              const params = new URLSearchParams();
              params.set("period", period);
              params.set("date", currentDate);
              params.set("postedBy", "");
              params.set("user", "");
              return `/kudos?${params.toString()}`;
            })();
            return (
              <a
                href={resetUrl}
                hx-get={resetUrl}
                hx-target="#kudos-content"
                hx-swap="innerHTML"
                hx-push-url={resetUrl}
                class="text-xs font-semibold text-accent hover:text-ink transition-colors self-end pb-2.5 cursor-pointer"
              >
                {t(locale, "kudos.filter.clearAll")}
              </a>
            );
          })()}
      </div>

      <p class="text-sm text-secondary mb-6">
        {total} {t(locale, total === 1 ? "kudos.count.one" : "kudos.count.other")}
      </p>

      {entries.length === 0 ? (
        <p class="text-center text-muted py-16 whitespace-pre-line">{t(locale, "kudos.empty")}</p>
      ) : (
        <div class="space-y-3 stagger-in">
          {entries.map((entry) => (
            <KudosCard
              key={entry.entryId}
              entry={entry}
              locale={locale}
              mrkdwnLabels={mrkdwnLabels}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div class="flex justify-center gap-2 mt-8">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
            const params = new URLSearchParams();
            params.set("period", period);
            params.set("date", currentDate);
            params.set("postedBy", activePostedBy ?? "");
            params.set("user", activeMentionedUser ?? "");
            if (p > 1) params.set("page", String(p));
            const href = `/kudos?${params.toString()}`;
            return (
              <a
                key={p}
                href={href}
                hx-get={href}
                hx-target="#kudos-content"
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

export function KudosPage(props: KudosPageProps) {
  const { displayName, avatarUrl, locale, theme, isAdmin, devMode, ...contentProps } = props;
  return (
    <Layout title={t(locale, "page.kudos")} locale={locale} theme={theme} devMode={devMode}>
      <Nav
        displayName={displayName}
        avatarUrl={avatarUrl}
        locale={locale}
        theme={theme}
        isAdmin={isAdmin}
      />
      <main class="max-w-3xl mx-auto px-6 py-10">
        <div class="mb-6">
          <h1 class="text-xl font-bold text-ink tracking-tight">{t(locale, "page.kudos")}</h1>
        </div>
        <div id="kudos-content">
          <KudosContentPartial {...contentProps} locale={locale} />
        </div>
      </main>
    </Layout>
  );
}
