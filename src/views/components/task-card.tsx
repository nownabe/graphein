import type { InferSelectModel } from "drizzle-orm";
import type { tasks } from "../../db/schema";

type Task = InferSelectModel<typeof tasks>;

const statusLabel: Record<string, string> = {
  open: "未完了",
  done: "完了",
  archived: "アーカイブ済み",
};

const statusColor: Record<string, string> = {
  open: "bg-gray-100 text-gray-700",
  done: "bg-green-100 text-green-700",
  archived: "bg-yellow-100 text-yellow-700",
};

export function TaskCard({
  task,
  showActions,
}: {
  task: Task;
  showActions?: boolean;
}) {
  const deadlineStr = task.deadline
    ? new Date(task.deadline).toLocaleString("ja-JP", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div
      id={`task-${task.id}`}
      class="bg-white rounded-lg border border-gray-200 p-4"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <h3 class="font-medium text-gray-900">{task.title}</h3>
          {task.description && (
            <p class="text-sm text-gray-600 mt-1 line-clamp-2">
              {task.description}
            </p>
          )}
          <div class="flex items-center gap-3 mt-2 text-xs text-gray-500">
            <span
              class={`font-medium px-2 py-0.5 rounded-full ${statusColor[task.status]}`}
            >
              {statusLabel[task.status]}
            </span>
            {deadlineStr && <span>期限: {deadlineStr}</span>}
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
        {showActions && task.status !== "archived" && (
          <div class="flex items-center gap-1 shrink-0">
            {task.status === "open" ? (
              <button
                hx-patch={`/tasks/${task.id}/status`}
                hx-vals='{"status":"done"}'
                hx-target={`#task-${task.id}`}
                hx-swap="outerHTML"
                class="text-xs px-2 py-1 rounded border border-green-300 text-green-700 hover:bg-green-50 transition-colors"
                title="完了にする"
              >
                完了
              </button>
            ) : (
              <button
                hx-patch={`/tasks/${task.id}/status`}
                hx-vals='{"status":"open"}'
                hx-target={`#task-${task.id}`}
                hx-swap="outerHTML"
                class="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                title="未完了に戻す"
              >
                戻す
              </button>
            )}
            <a
              href={`/tasks/${task.id}/edit`}
              class="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
              title="編集"
            >
              編集
            </a>
            <button
              hx-patch={`/tasks/${task.id}/status`}
              hx-vals='{"status":"archived"}'
              hx-target={`#task-${task.id}`}
              hx-swap="outerHTML"
              class="text-xs px-2 py-1 rounded border border-gray-300 text-gray-400 hover:bg-gray-50 transition-colors"
              title="アーカイブ"
            >
              アーカイブ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
