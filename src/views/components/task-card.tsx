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
    ? new Date(task.deadline).toLocaleString(
        loc === "en" ? "en-US" : "ja-JP",
        {
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        },
      )
    : null;

  const isOverdue =
    task.deadline && !isDone && new Date(task.deadline) < new Date();

  const cardBase =
    "group rounded-[var(--radius-lg)] border p-4 transition-all duration-150";
  const cardState = isOverdue
    ? "bg-[color-mix(in_srgb,var(--color-danger)_6%,var(--color-surface))] border-danger-dim/30"
    : isDone
      ? "bg-surface/50 border-edge/50"
      : "bg-surface border-edge hover:border-muted";

  return (
    <div id={`task-${task.id}`} class={`${cardBase} ${cardState}`}>
      <div class="flex items-start gap-3">
        {showActions && !task.archived && (
          isAssignee ? (
            <input
              type="checkbox"
              checked={isDone}
              aria-label={task.title}
              hx-patch={`/tasks/${task.id}/done`}
              hx-target={`#task-${task.id}`}
              hx-swap="outerHTML"
              class="mt-0.5"
            />
          ) : (
            <div class="shrink-0" style="width:1.125rem" />
          )
        )}
        <div class="min-w-0 flex-1">
          {task.description ? (
            <details>
              <summary
                class={`font-medium text-sm leading-snug cursor-pointer select-none ${
                  isDone ? "line-through text-muted" : "text-ink"
                }`}
              >
                {task.title}
                <span class="disclosure-arrow text-muted ml-1.5 text-[10px]">
                  &#9654;
                </span>
              </summary>
              <p
                class={`text-[13px] mt-2 whitespace-pre-wrap leading-relaxed ${
                  isDone ? "text-muted" : "text-secondary"
                }`}
              >
                {task.description}
              </p>
            </details>
          ) : (
            <h3
              class={`font-medium text-sm leading-snug ${
                isDone ? "line-through text-muted" : "text-ink"
              }`}
            >
              {task.title}
            </h3>
          )}
          <div class="flex items-center gap-3 mt-1.5 text-xs text-secondary">
            {deadlineStr && (
              <span class={isOverdue ? "text-danger font-semibold" : ""}>
                {isOverdue && (
                  <span class="mr-1">⚠</span>
                )}
                {deadlineStr}
                {isOverdue && (
                  <span class="ml-1">
                    ({t(loc, "task.overdue")})
                  </span>
                )}
              </span>
            )}
            {task.slackPermalink && (
              <a
                href={task.slackPermalink}
                target="_blank"
                rel="noopener noreferrer"
                hx-boost="false"
                class="text-muted hover:text-accent transition-colors inline-flex items-center gap-1"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  class="shrink-0"
                >
                  <path
                    d="M2.5 7.5a1.25 1.25 0 1 1 0-2.5H5v1.25A1.25 1.25 0 0 1 3.75 7.5h-1.25zM4.5 4.5a1.25 1.25 0 1 1 2.5 0V7h-1.25A1.25 1.25 0 0 1 4.5 5.75V4.5zM7.5 4.5a1.25 1.25 0 1 1 0 2.5H5V5.75A1.25 1.25 0 0 1 6.25 4.5h1.25zM9.5 7.5a1.25 1.25 0 0 1-1.25-1.25V5H7v1.25A1.25 1.25 0 0 0 8.25 7.5H9.5z"
                    fill="currentColor"
                  />
                </svg>
                Slack
              </a>
            )}
          </div>
        </div>
        {showActions && !task.archived && (
          <div class="actions-reveal flex items-center gap-0.5 shrink-0">
            {isOwner && (
              <a
                href={`/tasks/${task.id}/status`}
                class="text-xs px-2 py-1.5 rounded-[var(--radius-sm)] text-muted hover:text-ink hover:bg-surface-hover transition-colors"
                title={t(loc, "button.status.title")}
              >
                {t(loc, "button.status")}
              </a>
            )}
            {isOwner && (
              <a
                href={`/tasks/${task.id}/edit`}
                class="text-xs px-2 py-1.5 rounded-[var(--radius-sm)] text-muted hover:text-ink hover:bg-surface-hover transition-colors"
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
                class="text-xs px-2 py-1.5 rounded-[var(--radius-sm)] text-muted hover:text-danger hover:bg-[var(--color-glow-danger)] transition-colors"
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
