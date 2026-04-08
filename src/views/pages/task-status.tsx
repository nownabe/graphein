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
  const progressPct = assignees.length > 0 ? Math.round((doneCount / assignees.length) * 100) : 0;

  return (
    <Layout title={t(locale, "page.taskStatus")} locale={locale}>
      <Nav displayName={displayName} locale={locale} />
      <main class="max-w-3xl mx-auto px-4 py-8">
        <a
          href="/"
          class="text-sm text-warm-500 hover:text-vermillion-500 transition-colors mb-4 inline-block"
        >
          {t(locale, "link.backToMyTasksFromEdit")}
        </a>
        <h1 class="font-display text-3xl font-semibold text-ink tracking-wide mb-2">
          {task.title}
        </h1>
        <div class="flex items-center gap-3 mb-6">
          <span class="text-sm text-warm-500">
            {t(locale, "taskStatus.progress")}: {doneCount} / {assignees.length}
          </span>
          {/* Progress bar */}
          <div class="flex-1 max-w-48 h-1.5 bg-warm-200 rounded-full overflow-hidden">
            <div
              class="h-full bg-forest-500 rounded-full transition-all"
              style={`width: ${progressPct}%`}
            />
          </div>
        </div>

        <div class="bg-cream rounded-lg border border-warm-200">
          <ul class="divide-y divide-warm-100">
            {assignees.map((a) => (
              <li class="flex items-center gap-3 px-6 py-4">
                <span
                  class={`flex items-center justify-center w-6 h-6 rounded-full text-sm ${
                    a.done
                      ? "bg-forest-100 text-forest-600"
                      : "bg-warm-100 text-warm-400"
                  }`}
                >
                  {a.done ? "\u2713" : ""}
                </span>
                <span class={`text-sm ${a.done ? "text-warm-400" : "text-ink font-medium"}`}>
                  {a.displayName}
                </span>
                <span class={`ml-auto text-xs ${a.done ? "text-forest-500" : "text-warm-400"}`}>
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
