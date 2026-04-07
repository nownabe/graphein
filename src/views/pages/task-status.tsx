import type { InferSelectModel } from "drizzle-orm";
import type { tasks } from "../../db/schema";
import { t } from "../../i18n/index";
import { Layout } from "../layout";
import { Nav } from "../components/nav";

type Task = InferSelectModel<typeof tasks>;
type AssigneeStatus = { displayName: string; done: boolean };

export function TaskStatusPage({
  task,
  assignees,
  displayName,
  locale,
}: {
  task: Task;
  assignees: AssigneeStatus[];
  displayName: string;
  locale: string;
}) {
  const doneCount = assignees.filter((a) => a.done).length;

  return (
    <Layout title={t(locale, "page.taskStatus")} locale={locale}>
      <Nav displayName={displayName} locale={locale} />
      <main class="max-w-3xl mx-auto px-4 py-8">
        <a
          href="/"
          class="text-sm text-indigo-600 hover:text-indigo-800 mb-4 inline-block"
        >
          {t(locale, "link.backToMyTasksFromEdit")}
        </a>
        <h1 class="text-2xl font-bold text-gray-900 mb-2">
          {task.title}
        </h1>
        <p class="text-sm text-gray-500 mb-6">
          {t(locale, "taskStatus.progress")}: {doneCount} / {assignees.length}
        </p>

        <div class="bg-white rounded-lg border border-gray-200">
          <ul class="divide-y divide-gray-100">
            {assignees.map((a) => (
              <li class="flex items-center gap-3 px-6 py-4">
                <span
                  class={`flex items-center justify-center w-6 h-6 rounded-full text-sm ${
                    a.done
                      ? "bg-green-100 text-green-600"
                      : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {a.done ? "\u2713" : ""}
                </span>
                <span class={`text-sm ${a.done ? "text-gray-500" : "text-gray-900 font-medium"}`}>
                  {a.displayName}
                </span>
                <span class={`ml-auto text-xs ${a.done ? "text-green-600" : "text-gray-400"}`}>
                  {a.done ? t(locale, "status.done") : t(locale, "status.open")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </Layout>
  );
}
