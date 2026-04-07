import type { InferSelectModel } from "drizzle-orm";
import type { tasks } from "../../db/schema";
import { t } from "../../i18n/index";
import { Layout } from "../layout";
import { Nav } from "../components/nav";
import { TaskList } from "../components/task-list";

type Task = InferSelectModel<typeof tasks> & { done: boolean; isOwner: boolean };

export function StatusFilterTabs({
  activeFilter,
  locale,
}: {
  activeFilter: string;
  locale: string;
}) {
  const tabs = [
    { key: "all", label: t(locale, "filter.all") },
    { key: "open", label: t(locale, "filter.open") },
    { key: "done", label: t(locale, "filter.done") },
  ];

  return (
    <div class="flex gap-1 mb-4">
      {tabs.map((tab) => {
        const isActive = tab.key === activeFilter;
        return (
          <button
            key={tab.key}
            hx-get={`/?filter=${tab.key}`}
            hx-target="#task-list"
            hx-swap="innerHTML"
            hx-push-url="false"
            class={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              isActive
                ? "bg-indigo-600 text-white"
                : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function HomePage({
  tasks,
  displayName,
  locale,
  activeFilter,
}: {
  tasks: Task[];
  displayName: string;
  locale: string;
  activeFilter?: string;
}) {
  const filter = activeFilter ?? "all";
  return (
    <Layout title={t(locale, "page.myTasks")} locale={locale}>
      <Nav displayName={displayName} locale={locale} />
      <main class="max-w-3xl mx-auto px-4 py-8">
        <div class="flex items-center justify-between mb-6">
          <h1 class="text-2xl font-bold text-gray-900">
            {t(locale, "page.myTasks")}
          </h1>
          <a
            href="/archived"
            class="text-sm text-gray-500 hover:text-gray-700"
          >
            {t(locale, "link.archived")}
          </a>
        </div>
        <StatusFilterTabs activeFilter={filter} locale={locale} />
        <div id="task-list">
          <TaskList
            tasks={tasks}
            showActions
            emptyMessage={t(locale, "empty.tasks")}
            locale={locale}
          />
        </div>
      </main>
    </Layout>
  );
}

export function HomeTaskListPartial({
  tasks,
  locale,
}: {
  tasks: Task[];
  locale: string;
}) {
  return (
    <TaskList
      tasks={tasks}
      showActions
      emptyMessage={t(locale, "empty.tasks")}
      locale={locale}
    />
  );
}
