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

// ---------------------------------------------------------------------------
// Single-select filter: Custom dropdown matching multi-select visual style
// ---------------------------------------------------------------------------
function SingleSelectFilter({
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

  const instanceId = `ss-${name}`;
  const selectedOption = options.find((o) => o.id === activeValue);
  const displayLabel = selectedOption ? selectedOption.label : allLabel;
  const hasSelection = !!activeValue;

  const initScript = [
    `(function(){`,
    `var w=document.getElementById('${instanceId}');if(!w)return;`,
    `var btn=w.querySelector('.ss-trigger');`,
    `var pop=w.querySelector('.ss-popover');`,
    `var list=w.querySelector('.ss-list');`,
    `var open=false;`,
    `function close(){open=false;pop.style.display='none';btn.setAttribute('aria-expanded','false')}`,
    `function toggle(){`,
    `if(!open){document.dispatchEvent(new CustomEvent('snippetFilterClose',{detail:{except:'${instanceId}'}}))}`,
    `open=!open;pop.style.display=open?'block':'none';btn.setAttribute('aria-expanded',String(open))}`,
    `function select(v){var url=new window.URL(window.location.href);`,
    `if(v){url.searchParams.set('${name}',v)}else{url.searchParams.delete('${name}')}`,
    `url.searchParams.delete('page');`,
    `htmx.ajax('GET',url.pathname+url.search,{target:'#snippets-content',swap:'innerHTML'});`,
    `history.pushState(null,'',url.pathname+url.search)}`,
    `btn.addEventListener('click',function(e){e.stopPropagation();toggle()});`,
    `list.addEventListener('click',function(e){var b=e.target.closest('button');if(b){select(b.dataset.value||'')}});`,
    `document.addEventListener('click',function(e){if(open&&!w.contains(e.target)){close()}});`,
    `document.addEventListener('keydown',function(e){if(e.key==='Escape'&&open){close();btn.focus()}});`,
    `document.addEventListener('snippetFilterClose',function(e){`,
    `if(e.detail&&e.detail.except!=='${instanceId}'&&open){close()}})`,
    `})()`,
  ].join("");
  return (
    <div class="flex flex-col gap-1.5">
      <span class="text-xs font-semibold text-secondary uppercase tracking-wider">{label}</span>
      <div id={instanceId} class="relative">
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
          class="ss-popover absolute z-30 left-0 top-full mt-1 w-56 bg-surface border border-edge rounded-[var(--radius-sm)] overflow-hidden"
          style="display:none;box-shadow:0 8px 24px rgba(0,0,0,0.15)"
        >
          <div class="ss-list max-h-48 overflow-y-auto py-1">
            <button
              type="button"
              data-value=""
              class={`w-full flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-surface-hover transition-colors ${!hasSelection ? "text-ink font-medium" : "text-secondary"}`}
            >
              <span class="w-4 flex-shrink-0 text-accent">
                {!hasSelection && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M2.5 7.5L5.5 10.5L11.5 3.5" />
                  </svg>
                )}
              </span>
              <span>{allLabel}</span>
            </button>
            {options.map((opt) => {
              const isSelected = opt.id === activeValue;
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-value={opt.id}
                  class={`w-full flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-surface-hover transition-colors ${isSelected ? "text-ink font-medium" : "text-secondary"}`}
                >
                  <span class="w-4 flex-shrink-0 text-accent">
                    {isSelected && (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M2.5 7.5L5.5 10.5L11.5 3.5" />
                      </svg>
                    )}
                  </span>
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <script dangerouslySetInnerHTML={{ __html: initScript }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Multi-select filter: Popover trigger (A) + checkmark list (C)
// Trigger button with count badge → dropdown with search + checkmark list
// ---------------------------------------------------------------------------
function MultiSelectFilter({
  name,
  label,
  options,
  activeValues,
  searchPlaceholder,
  noResultsLabel,
  okLabel,
}: {
  name: string;
  label: string;
  options: FilterOption[];
  activeValues: string[];
  searchPlaceholder: string;
  noResultsLabel: string;
  okLabel: string;
}) {
  if (options.length === 0) return null;

  const activeSet = new Set(activeValues);
  const selectedCount = activeValues.length;
  const instanceId = `ms-${name}`;

  const triggerLabel =
    selectedCount === 0
      ? searchPlaceholder
      : options
          .filter((o) => activeSet.has(o.id))
          .map((o) => o.label)
          .join(", ");

  const noResultsEscaped = noResultsLabel.replace(/'/g, "\\'");
  const initScript = [
    `(function(){`,
    `var w=document.getElementById('${instanceId}');if(!w)return;`,
    `var btn=w.querySelector('.ms-trigger');`,
    `var pop=w.querySelector('.ms-popover');`,
    `var input=w.querySelector('.ms-search');`,
    `var list=w.querySelector('.ms-list');`,
    `var okBtn=w.querySelector('.ms-ok');`,
    `var sel=JSON.parse(w.dataset.selected||'[]');`,
    `var open=false;`,
    `function fuzzy(q,t){q=q.toLowerCase();t=t.toLowerCase();`,
    `var qi=0;for(var ti=0;ti<t.length&&qi<q.length;ti++){if(t[ti]===q[qi])qi++}return qi===q.length}`,
    `function close(){open=false;pop.style.display='none';btn.setAttribute('aria-expanded','false')}`,
    `function toggle(){`,
    `if(!open){document.dispatchEvent(new CustomEvent('snippetFilterClose',{detail:{except:'${instanceId}'}}))}`,
    `open=!open;pop.style.display=open?'block':'none';btn.setAttribute('aria-expanded',String(open));`,
    `if(open){input.value='';render();input.focus()}}`,
    `function render(){var q=input.value;list.innerHTML='';`,
    `var opts=JSON.parse(w.dataset.options||'[]');var count=0;`,
    `opts.forEach(function(o){if(q&&!fuzzy(q,o.label))return;count++;`,
    `var checked=sel.indexOf(o.id)!==-1;`,
    `var item=document.createElement('button');item.type='button';`,
    `item.className='w-full flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-surface-hover transition-colors';`,
    `var check=document.createElement('span');check.className='w-4 flex-shrink-0 text-accent';`,
    `check.innerHTML=checked?'<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2"`,
    ` stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 7.5L5.5 10.5L11.5 3.5"/></svg>':'';`,
    `var span=document.createElement('span');`,
    `span.className=checked?'text-ink font-medium':'text-secondary';`,
    `span.textContent=o.label;item.appendChild(check);item.appendChild(span);`,
    `item.addEventListener('click',function(ev){ev.stopPropagation();`,
    `if(checked){sel=sel.filter(function(s){return s!==o.id})}else{sel.push(o.id)}render()});`,
    `list.appendChild(item)});`,
    `if(count===0&&q){var empty=document.createElement('div');`,
    `empty.className='px-3 py-2 text-sm text-muted';`,
    `empty.textContent='${noResultsEscaped}';list.appendChild(empty)}}`,
    `function sync(){var url=new window.URL(window.location.href);`,
    `if(sel.length>0){url.searchParams.set('${name}',sel.join(','))}`,
    `else{url.searchParams.delete('${name}')}`,
    `url.searchParams.delete('page');`,
    `htmx.ajax('GET',url.pathname+url.search,{target:'#snippets-content',swap:'innerHTML'});`,
    `history.pushState(null,'',url.pathname+url.search)}`,
    `btn.addEventListener('click',function(e){e.stopPropagation();toggle()});`,
    `okBtn.addEventListener('click',function(e){e.stopPropagation();sync()});`,
    `input.addEventListener('input',render);`,
    `document.addEventListener('click',function(e){if(open&&!w.contains(e.target)){close()}});`,
    `document.addEventListener('keydown',function(e){if(e.key==='Escape'&&open){close();btn.focus()}});`,
    `document.addEventListener('snippetFilterClose',function(e){`,
    `if(e.detail&&e.detail.except!=='${instanceId}'&&open){close()}})`,
    `})()`,
  ].join("");
  return (
    <div class="flex flex-col gap-1.5">
      <span class="text-xs font-semibold text-secondary uppercase tracking-wider">{label}</span>
      <div
        id={instanceId}
        class="relative"
        data-selected={JSON.stringify(activeValues)}
        data-options={JSON.stringify(options.map((o) => ({ id: o.id, label: o.label })))}
      >
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded="false"
          class="ms-trigger flex items-center gap-1.5 bg-page border border-edge rounded-[var(--radius-sm)] pl-2.5 pr-2 py-2 text-sm cursor-pointer hover:border-muted transition-colors h-9"
          style="min-width:140px"
        >
          <span
            class={`truncate flex-1 text-left ${selectedCount > 0 ? "text-ink" : "text-muted"}`}
          >
            {selectedCount > 0 ? triggerLabel : searchPlaceholder}
          </span>
          {selectedCount > 0 && (
            <span class="flex items-center justify-center w-5 h-5 rounded-full text-xs font-semibold text-page bg-accent">
              {selectedCount}
            </span>
          )}
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
          class="ms-popover absolute z-30 left-0 top-full mt-1 w-64 bg-surface border border-edge rounded-[var(--radius-sm)] overflow-hidden"
          style="display:none;box-shadow:0 8px 24px rgba(0,0,0,0.15)"
        >
          <div class="p-2 border-b border-edge">
            <input
              type="text"
              placeholder={searchPlaceholder}
              class="ms-search w-full bg-page border border-edge rounded-[6px] px-2.5 py-1.5 text-sm text-ink placeholder:text-muted"
              autocomplete="off"
            />
          </div>
          <div class="ms-list max-h-48 overflow-y-auto" />
          <div class="p-2 border-t border-edge">
            <button
              type="button"
              class="ms-ok w-full bg-accent text-page font-semibold text-sm py-1.5 rounded-[6px] cursor-pointer hover:opacity-90 transition-opacity"
            >
              {okLabel}
            </button>
          </div>
        </div>
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
      <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
        <PeriodTabs activePeriod={period} locale={locale} buildUrl={buildUrl} />
        <div class="flex items-center gap-3">
          <a
            href={prevUrl}
            hx-get={prevUrl}
            hx-target="#snippets-content"
            hx-swap="innerHTML"
            hx-push-url={prevUrl}
            class="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] text-muted hover:text-ink hover:bg-surface-hover transition-colors"
            title={t(locale, "snippets.prev")}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M10.354 3.354a.5.5 0 00-.708-.708l-5 5a.5.5 0 000 .708l5 5a.5.5 0 00.708-.708L5.707 8l4.647-4.646z" />
            </svg>
          </a>
          <span class="text-sm font-semibold text-ink text-center" style="min-width:140px">
            {periodLabel}
          </span>
          <a
            href={nextUrl}
            hx-get={nextUrl}
            hx-target="#snippets-content"
            hx-swap="innerHTML"
            hx-push-url={nextUrl}
            class="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] text-muted hover:text-ink hover:bg-surface-hover transition-colors"
            title={t(locale, "snippets.next")}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M5.646 3.354a.5.5 0 01.708-.708l5 5a.5.5 0 010 .708l-5 5a.5.5 0 01-.708-.708L10.293 8 5.646 3.354z" />
            </svg>
          </a>
        </div>
      </div>

      <div class="flex flex-wrap items-end gap-4 mb-4 relative z-10">
        <SingleSelectFilter
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
          searchPlaceholder={t(locale, "snippets.filter.searchUser")}
          noResultsLabel={t(locale, "snippets.filter.noResults")}
          okLabel={t(locale, "snippets.filter.ok")}
        />
        <MultiSelectFilter
          name="usergroup"
          label={t(locale, "snippets.filter.mentionedUsergroup")}
          options={mentionedUsergroups}
          activeValues={activeMentionedUsergroups}
          searchPlaceholder={t(locale, "snippets.filter.searchUsergroup")}
          noResultsLabel={t(locale, "snippets.filter.noResults")}
          okLabel={t(locale, "snippets.filter.ok")}
        />
      </div>

      <p class="text-sm text-secondary mb-6">
        {total} {t(locale, total === 1 ? "snippets.count.one" : "snippets.count.other")}
      </p>

      {snippetList.length === 0 ? (
        <p class="text-center text-muted py-16 whitespace-pre-line">
          {t(locale, "snippets.empty")}
        </p>
      ) : (
        <div class="space-y-3 stagger-in">
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
