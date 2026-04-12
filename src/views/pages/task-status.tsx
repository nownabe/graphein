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
  theme,
  isAdmin,
  devMode,
}: {
  task: Task;
  assignees: AssigneeStatus[];
  displayName: string;
  locale: string;
  theme?: string;
  isAdmin?: boolean;
  devMode?: boolean;
}) {
  const doneCount = assignees.filter((a) => a.done).length;

  return (
    <Layout title={`${task.title} | ${t(locale, "page.taskStatus")}`} locale={locale} theme={theme} devMode={devMode}>
      <Nav displayName={displayName} locale={locale} theme={theme} isAdmin={isAdmin} />
      <main class="max-w-3xl mx-auto px-6 py-10">
        <a
          href="/tasks"
          class="text-xs text-muted hover:text-accent transition-colors mb-4 inline-flex items-center gap-1"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" class="shrink-0">
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
        <div class="mb-8">
          <h1 class="text-xl font-bold text-ink tracking-tight mb-1">{task.title}</h1>
          <p class="text-sm text-secondary">{t(locale, "page.taskStatus")}</p>
        </div>

        {assignees.length > 0 && (
          <div class="mb-8">
            <div
              class="h-2 w-full rounded-full bg-surface-hover border border-edge overflow-hidden mb-2"
              role="progressbar"
              aria-valuenow={doneCount}
              aria-valuemin={0}
              aria-valuemax={assignees.length}
            >
              <div
                class="h-full bg-success transition-[width] duration-300"
                style={`width: ${(doneCount / assignees.length) * 100}%`}
              />
            </div>
            <p class="text-xs text-secondary tabular-nums">
              {doneCount}/{assignees.length} {t(locale, "taskStatus.progress").toLowerCase()}
            </p>
          </div>
        )}

        <div class="bg-surface border border-edge rounded-[var(--radius-lg)]">
          <ul class="divide-y divide-edge">
            {assignees.map((a) => (
              <li class="flex items-center gap-3 px-5 py-4">
                <span
                  class={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                    a.done
                      ? "bg-[var(--color-glow-success)] text-success"
                      : "bg-surface-hover text-muted"
                  }`}
                >
                  {a.done ? "\u2713" : ""}
                </span>
                <span class={`text-sm ${a.done ? "text-secondary" : "text-ink font-medium"}`}>
                  {a.displayName}
                </span>
                <span
                  class={`ml-auto text-xs font-semibold ${a.done ? "text-success" : "text-muted"}`}
                >
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
