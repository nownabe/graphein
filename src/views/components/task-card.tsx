import type { InferSelectModel } from "drizzle-orm";
import type { tasks } from "../../db/schema";
import { t } from "../../i18n/index";
import { Mrkdwn, type MrkdwnOptions } from "../../slack/mrkdwn";

type Task = InferSelectModel<typeof tasks>;

export function TaskCard({
  task,
  done,
  isOwner,
  isAssignee,
  showActions,
  locale,
  mrkdwnLabels,
}: {
  task: Task;
  done?: boolean;
  isOwner?: boolean;
  isAssignee?: boolean;
  showActions?: boolean;
  locale?: string;
  mrkdwnLabels?: MrkdwnOptions;
}) {
  const loc = locale ?? "ja";
  const isDone = done ?? false;
  const deadlineStr = task.deadline
    ? (() => {
        const d = new Date(task.deadline);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const hh = String(d.getHours()).padStart(2, "0");
        const min = String(d.getMinutes()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
      })()
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
        {showActions && (
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
              <div
                class={`text-[13px] mt-2 leading-relaxed ${
                  isDone ? "text-muted" : "text-secondary"
                }`}
              >
                <Mrkdwn text={task.description} options={mrkdwnLabels} />
              </div>
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
                Slack
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 12 12"
                  fill="none"
                  class="shrink-0"
                >
                  <path
                    d="M4.5 2.5h5v5M9.5 2.5L4 8"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
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
