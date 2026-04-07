import type { InferSelectModel } from "drizzle-orm";
import type { tasks } from "../../db/schema";
import { t } from "../../i18n/index";
import { Layout } from "../layout";
import { Nav } from "../components/nav";
import { TaskList } from "../components/task-list";

type Task = InferSelectModel<typeof tasks> & { done: boolean };

export function ArchivedPage({
  tasks,
  displayName,
  locale,
}: {
  tasks: Task[];
  displayName: string;
  locale: string;
}) {
  return (
    <Layout title={t(locale, "page.archived")} locale={locale}>
      <Nav displayName={displayName} locale={locale} />
      <main class="max-w-3xl mx-auto px-4 py-8">
        <div class="flex items-center gap-4 mb-6">
          <a href="/" class="text-sm text-indigo-600 hover:text-indigo-800">
            {t(locale, "link.backToMyTasks")}
          </a>
          <h1 class="text-2xl font-bold text-gray-900">
            {t(locale, "page.archived")}
          </h1>
        </div>
        <TaskList
          tasks={tasks}
          emptyMessage={t(locale, "empty.archived")}
          locale={locale}
        />
      </main>
    </Layout>
  );
}
