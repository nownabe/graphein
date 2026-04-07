import type { InferSelectModel } from "drizzle-orm";
import type { tasks } from "../../db/schema";
import { t } from "../../i18n/index";

type Task = InferSelectModel<typeof tasks>;

export function TaskCard({
  task,
  done,
  showActions,
  locale,
}: {
  task: Task;
  done?: boolean;
  showActions?: boolean;
  locale?: string;
}) {
  const loc = locale ?? "ja";
  const isDone = done ?? false;
  const deadlineStr = task.deadline
    ? new Date(task.deadline).toLocaleString(loc === "en" ? "en-US" : "ja-JP", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const isOverdue =
    task.deadline &&
    !isDone &&
    new Date(task.deadline) < new Date();

  return (
    <div
      id={`task-${task.id}`}
      class={`bg-white rounded-lg border border-gray-200 p-4 transition-shadow hover:shadow-md ${isDone ? "opacity-60" : ""}`}
    >
      <div class="flex items-start gap-3">
        {showActions && !task.archived && (
          <input
            type="checkbox"
            checked={isDone}
            hx-patch={`/tasks/${task.id}/done`}
            hx-target={`#task-${task.id}`}
            hx-swap="outerHTML"
            class="mt-1 h-5 w-5 rounded border-gray-300 text-indigo-600 cursor-pointer shrink-0"
          />
        )}
        <div class="min-w-0 flex-1">
          {task.description ? (
            <details>
              <summary class={`font-medium cursor-pointer ${isDone ? "line-through text-gray-400" : "text-gray-900"}`}>
                {task.title}
              </summary>
              <p class={`text-sm mt-1 whitespace-pre-wrap ${isDone ? "text-gray-400" : "text-gray-600"}`}>
                {task.description}
              </p>
            </details>
          ) : (
            <h3 class={`font-medium ${isDone ? "line-through text-gray-400" : "text-gray-900"}`}>
              {task.title}
            </h3>
          )}
          <div class="flex items-center gap-3 mt-2 text-xs text-gray-500">
            {deadlineStr && (
              <span class={isOverdue ? "text-red-600 font-medium" : ""}>
                {t(loc, "task.deadline")}: {deadlineStr}
              </span>
            )}
            {task.slackPermalink && (
              <a
                href={task.slackPermalink}
                target="_blank"
                rel="noopener noreferrer"
                hx-boost="false"
                class="text-indigo-600 hover:text-indigo-800"
              >
                Slack
              </a>
            )}
          </div>
        </div>
        {showActions && !task.archived && (
          <div class="flex items-center gap-1 shrink-0">
            <a
              href={`/tasks/${task.id}/edit`}
              class="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
              title={t(loc, "button.edit.title")}
            >
              {t(loc, "button.edit")}
            </a>
            <button
              hx-patch={`/tasks/${task.id}/archive`}
              hx-target={`#task-${task.id}`}
              hx-swap="outerHTML"
              hx-confirm={t(loc, "confirm.archive")}
              class="text-xs px-2 py-1 rounded border border-gray-300 text-gray-400 hover:bg-gray-50 transition-colors"
              title={t(loc, "button.archive.title")}
            >
              {t(loc, "button.archive")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
