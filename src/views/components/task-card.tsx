import type { InferSelectModel } from "drizzle-orm";
import type { tasks } from "../../db/schema";
import { t } from "../../i18n/index";

type Task = InferSelectModel<typeof tasks>;

export function TaskCard({
  task,
  done,
  isOwner,
  isAssignee,
  showActions,
  locale,
}: {
  task: Task;
  done?: boolean;
  isOwner?: boolean;
  isAssignee?: boolean;
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
      class={`group bg-cream rounded-lg border border-warm-200 p-4 transition-all hover:shadow-[0_2px_12px_rgba(44,36,32,0.06)] hover:border-warm-300 ${
        isDone ? "opacity-50" : ""
      } ${!isDone && !task.archived ? "border-l-[3px] border-l-vermillion-500/0 hover:border-l-vermillion-500/60" : ""}`}
    >
      <div class="flex items-start gap-3">
        {showActions && !task.archived && isAssignee && (
          <input
            type="checkbox"
            checked={isDone}
            hx-patch={`/tasks/${task.id}/done`}
            hx-target={`#task-${task.id}`}
            hx-swap="outerHTML"
            class="mt-1 h-5 w-5 rounded border-warm-300 cursor-pointer shrink-0"
          />
        )}
        <div class="min-w-0 flex-1">
          {task.description ? (
            <details>
              <summary class={`font-medium cursor-pointer ${isDone ? "line-through text-warm-400" : "text-ink"}`}>
                {task.title}
              </summary>
              <p class={`text-sm mt-2 whitespace-pre-wrap leading-relaxed ${isDone ? "text-warm-400" : "text-warm-600"}`}>
                {task.description}
              </p>
            </details>
          ) : (
            <h3 class={`font-medium ${isDone ? "line-through text-warm-400" : "text-ink"}`}>
              {task.title}
            </h3>
          )}
          <div class="flex items-center gap-3 mt-2 text-xs text-warm-500">
            {deadlineStr && (
              <span class={isOverdue ? "text-vermillion-500 font-medium" : ""}>
                {t(loc, "task.deadline")}: {deadlineStr}
              </span>
            )}
            {task.slackPermalink && (
              <a
                href={task.slackPermalink}
                target="_blank"
                rel="noopener noreferrer"
                hx-boost="false"
                class="text-warm-500 hover:text-vermillion-500 transition-colors"
              >
                Slack
              </a>
            )}
          </div>
        </div>
        {showActions && !task.archived && (
          <div class="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {isOwner && (
              <a
                href={`/tasks/${task.id}/status`}
                class="text-xs px-2 py-1 rounded border border-warm-200 text-warm-500 hover:text-ink hover:border-warm-400 hover:bg-warm-50 transition-colors"
                title={t(loc, "button.status.title")}
              >
                {t(loc, "button.status")}
              </a>
            )}
            {isOwner && (
              <a
                href={`/tasks/${task.id}/edit`}
                class="text-xs px-2 py-1 rounded border border-warm-200 text-warm-500 hover:text-ink hover:border-warm-400 hover:bg-warm-50 transition-colors"
                title={t(loc, "button.edit.title")}
              >
                {t(loc, "button.edit")}
              </a>
            )}
            {isOwner && (
              <button
                hx-patch={`/tasks/${task.id}/archive`}
                hx-target={`#task-${task.id}`}
                hx-swap="outerHTML"
                hx-confirm={t(loc, "confirm.archive")}
                class="text-xs px-2 py-1 rounded border border-warm-200 text-warm-400 hover:text-vermillion-500 hover:border-vermillion-500/30 hover:bg-vermillion-50 transition-colors"
                title={t(loc, "button.archive.title")}
              >
                {t(loc, "button.archive")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
