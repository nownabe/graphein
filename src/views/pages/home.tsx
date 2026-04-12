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
            hx-get={`/tasks?filter=${tab.key}`}
            hx-target="#home-content"
            hx-swap="innerHTML"
            hx-push-url={`/tasks?filter=${tab.key}`}
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

function ViewTabs({
  activeView,
  locale,
  assignedCount,
  ownedCount,
}: {
  activeView: "assigned" | "owned";
  locale: string;
  assignedCount: number;
  ownedCount: number;
}) {
  const tabs: Array<{
    key: "assigned" | "owned";
    label: string;
    count: number;
  }> = [
    {
      key: "assigned",
      label: t(locale, "view.assigned"),
      count: assignedCount,
    },
    {
      key: "owned",
      label: t(locale, "view.owned"),
      count: ownedCount,
    },
  ];
  return (
    <div class="flex items-center gap-1 border-b border-edge mb-6">
      {tabs.map((tab) => {
        const isActive = tab.key === activeView;
        const href =
          tab.key === "assigned" ? "/tasks" : "/tasks?view=owned";
        return (
          <button
            key={tab.key}
            hx-get={href}
            hx-target="#home-content"
            hx-swap="innerHTML"
            hx-push-url={href}
            class={`relative px-4 py-2.5 text-sm font-semibold transition-colors ${
              isActive
                ? "text-ink"
                : "text-muted hover:text-secondary"
            }`}
          >
            {tab.label}
            <span
              class={`ml-1.5 text-xs tabular-nums ${
                isActive ? "text-secondary" : "text-muted/60"
              }`}
            >
              {tab.count}
            </span>
            {isActive && (
              <span class="absolute left-0 right-0 -bottom-px h-0.5 bg-accent" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function HomeContentPartial({
  assignedTasks,
  ownedTasks,
  locale,
  activeFilter,
  activeView,
  counts,
  overdueCount,
  ownedOverdueCount,
  mrkdwnLabels,
}: {
  assignedTasks: Task[];
  ownedTasks: Task[];
  locale: string;
  activeFilter: string;
  activeView: "assigned" | "owned";
  counts: FilterCounts;
  overdueCount: number;
  ownedOverdueCount: number;
  mrkdwnLabels?: MrkdwnOptions;
}) {
  const isOwnedView = activeView === "owned";
  return (
    <>
      <ViewTabs
        activeView={activeView}
        locale={locale}
        assignedCount={counts.all}
        ownedCount={ownedTasks.length}
      />
      <div class="flex items-center justify-between mb-6">
        <p class="text-sm text-secondary">
          {isOwnedView ? (
            <>
              {ownedTasks.length} {t(locale, "summary.owned")}
              {ownedOverdueCount > 0 && (
                <span class="text-danger font-medium">
                  {" "}
                  · {ownedOverdueCount} {t(locale, "summary.overdue")}
                </span>
              )}
            </>
          ) : (
            <>
              {counts.open} {t(locale, "summary.open")}
              {overdueCount > 0 && (
                <span class="text-danger font-medium">
                  {" "}
                  · {overdueCount} {t(locale, "summary.overdue")}
                </span>
              )}
            </>
          )}
        </p>
        <a
          href="/tasks/archived"
          class="text-xs text-muted hover:text-accent transition-colors"
        >
          {t(locale, "link.archived")}
        </a>
      </div>
      {isOwnedView ? (
        <TaskList
          tasks={ownedTasks}
          showActions
          emptyMessage={t(locale, "empty.owned")}
          locale={locale}
          grouped
          mrkdwnLabels={mrkdwnLabels}
        />
      ) : (
        <>
          <div class="mb-6">
            <StatusFilterTabs
              activeFilter={activeFilter}
              locale={locale}
              counts={counts}
            />
          </div>
          <TaskList
            tasks={assignedTasks}
            showActions
            emptyMessage={t(locale, "empty.tasks")}
            locale={locale}
            grouped
            mrkdwnLabels={mrkdwnLabels}
          />
        </>
      )}
    </>
  );
}

export function HomePage({
  assignedTasks,
  ownedTasks,
  displayName,
  locale,
  activeFilter,
  activeView,
  counts,
  overdueCount,
  ownedOverdueCount,
  mrkdwnLabels,
  isAdmin,
}: {
  assignedTasks: Task[];
  ownedTasks: Task[];
  displayName: string;
  locale: string;
  activeFilter?: string;
  activeView?: "assigned" | "owned";
  counts: FilterCounts;
  overdueCount: number;
  ownedOverdueCount: number;
  mrkdwnLabels?: MrkdwnOptions;
  isAdmin?: boolean;
}) {
  const filter = activeFilter ?? "all";
  const view = activeView ?? "assigned";
  return (
    <Layout title={t(locale, "page.myTasks")} locale={locale}>
      <Nav displayName={displayName} locale={locale} isAdmin={isAdmin} />
      <main class="max-w-3xl mx-auto px-6 py-10">
        <div id="home-content">
          <HomeContentPartial
            assignedTasks={assignedTasks}
            ownedTasks={ownedTasks}
            locale={locale}
            activeFilter={filter}
            activeView={view}
            counts={counts}
            overdueCount={overdueCount}
            ownedOverdueCount={ownedOverdueCount}
            mrkdwnLabels={mrkdwnLabels}
          />
        </div>
      </main>
    </Layout>
  );
}
