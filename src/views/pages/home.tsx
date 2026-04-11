import type { InferSelectModel } from "drizzle-orm";
import type { tasks } from "../../db/schema";
import { t } from "../../i18n/index";
import type { MrkdwnOptions } from "../../slack/mrkdwn";
import { Layout } from "../layout";
import { Nav } from "../components/nav";
import { TaskList } from "../components/task-list";

type Task = InferSelectModel<typeof tasks> & {
  done: boolean;
  isOwner: boolean;
  isAssignee: boolean;
};

export type FilterCounts = { all: number; open: number; done: number };

function StatusFilterTabs({
  activeFilter,
  locale,
  counts,
}: {
  activeFilter: string;
  locale: string;
  counts: FilterCounts;
}) {
  const tabs = [
    { key: "all", label: t(locale, "filter.all"), count: counts.all },
    { key: "open", label: t(locale, "filter.open"), count: counts.open },
    { key: "done", label: t(locale, "filter.done"), count: counts.done },
  ];

  return (
    <div class="inline-flex bg-surface rounded-[var(--radius-sm)] p-0.5 border border-edge">
      {tabs.map((tab) => {
        const isActive = tab.key === activeFilter;
        return (
          <button
            key={tab.key}
            hx-get={`/?filter=${tab.key}`}
            hx-target="#home-content"
            hx-swap="innerHTML"
            hx-push-url={`/?filter=${tab.key}`}
            class={`px-3 py-1.5 text-xs font-semibold rounded-[6px] transition-all ${
              isActive
                ? "bg-accent text-page"
                : "text-muted hover:text-secondary"
            }`}
          >
            {tab.label}
            <span
              class={`ml-1 tabular-nums ${
                isActive ? "text-page/70" : "text-muted/60"
              }`}
            >
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function HomeContentPartial({
  tasks,
  locale,
  activeFilter,
  counts,
  overdueCount,
  mrkdwnLabels,
}: {
  tasks: Task[];
  locale: string;
  activeFilter: string;
  counts: FilterCounts;
  overdueCount: number;
  mrkdwnLabels?: MrkdwnOptions;
}) {
  return (
    <>
      <div class="mb-8">
        <h1 class="text-xl font-bold text-ink tracking-tight mb-1">
          {t(locale, "page.myTasks")}
        </h1>
        <p class="text-sm text-secondary">
          {counts.open} {t(locale, "summary.open")}
          {overdueCount > 0 && (
            <span class="text-danger font-medium">
              {" "}
              · {overdueCount} {t(locale, "summary.overdue")}
            </span>
          )}
        </p>
      </div>
      <div class="flex items-center justify-between mb-6">
        <StatusFilterTabs
          activeFilter={activeFilter}
          locale={locale}
          counts={counts}
        />
        <a
          href="/archived"
          class="text-xs text-muted hover:text-accent transition-colors"
        >
          {t(locale, "link.archived")}
        </a>
      </div>
      <TaskList
        tasks={tasks}
        showActions
        emptyMessage={t(locale, "empty.tasks")}
        locale={locale}
        grouped
        mrkdwnLabels={mrkdwnLabels}
      />
    </>
  );
}

export function HomePage({
  tasks,
  displayName,
  locale,
  activeFilter,
  counts,
  overdueCount,
  mrkdwnLabels,
}: {
  tasks: Task[];
  displayName: string;
  locale: string;
  activeFilter?: string;
  counts: FilterCounts;
  overdueCount: number;
  mrkdwnLabels?: MrkdwnOptions;
}) {
  const filter = activeFilter ?? "all";
  return (
    <Layout title={t(locale, "page.myTasks")} locale={locale}>
      <Nav displayName={displayName} locale={locale} />
      <main class="max-w-3xl mx-auto px-6 py-10">
        <div id="home-content">
          <HomeContentPartial
            tasks={tasks}
            locale={locale}
            activeFilter={filter}
            counts={counts}
            overdueCount={overdueCount}
            mrkdwnLabels={mrkdwnLabels}
          />
        </div>
      </main>
    </Layout>
  );
}
