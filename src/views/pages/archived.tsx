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

export function ArchivedPage({
  tasks,
  displayName,
  locale,
  mrkdwnLabels,
}: {
  tasks: Task[];
  displayName: string;
  locale: string;
  mrkdwnLabels?: MrkdwnOptions;
}) {
  return (
    <Layout title={t(locale, "page.archived")} locale={locale}>
      <Nav displayName={displayName} locale={locale} />
      <main class="max-w-3xl mx-auto px-6 py-10">
        <a
          href="/"
          class="text-xs text-muted hover:text-accent transition-colors mb-4 inline-flex items-center gap-1"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            class="shrink-0"
          >
            <path
              d="M8.5 3.5L5 7l3.5 3.5"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          {t(locale, "link.backToMyTasks")}
        </a>
        <h1 class="text-xl font-bold text-ink tracking-tight mb-8">
          {t(locale, "page.archived")}
        </h1>
        <TaskList
          tasks={tasks}
          showActions
          emptyMessage={t(locale, "empty.archived")}
          locale={locale}
          mrkdwnLabels={mrkdwnLabels}
        />
      </main>
    </Layout>
  );
}
