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

export function TaskCard({ task }: { task: Task }) {
  const deadlineStr = task.deadline
    ? new Date(task.deadline).toLocaleDateString("ja-JP")
    : null;

  return (
    <a
      href={`/tasks/${task.id}`}
      class="block bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
    >
      <div class="flex items-start justify-between gap-2">
        <h3 class="font-medium text-gray-900 line-clamp-2">{task.title}</h3>
        <span
          class={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${statusColor[task.status]}`}
        >
          {statusLabel[task.status]}
        </span>
      </div>
      {deadlineStr && (
        <p class="mt-2 text-sm text-gray-500">期限: {deadlineStr}</p>
      )}
    </a>
  );
}
