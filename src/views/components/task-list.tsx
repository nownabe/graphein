import type { InferSelectModel } from "drizzle-orm";
import type { tasks } from "../../db/schema";
import { t } from "../../i18n/index";
import { TaskCard } from "./task-card";

type AssigneeStatus = { displayName: string; done: boolean };
type Task = InferSelectModel<typeof tasks> & {
  done: boolean;
  isOwner: boolean;
  assignees: AssigneeStatus[];
};

export function TaskList({
  tasks,
  showActions,
  emptyMessage,
  locale,
}: {
  tasks: Task[];
  showActions?: boolean;
  emptyMessage?: string;
  locale?: string;
}) {
  const loc = locale ?? "ja";
  if (tasks.length === 0) {
    return (
      <div class="text-center py-12 text-gray-500">
        <p class="text-lg">{emptyMessage ?? t(loc, "empty.default")}</p>
      </div>
    );
  }

  return (
    <div class="grid gap-3">
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          done={task.done}
          isOwner={task.isOwner}
          assignees={task.assignees}
          showActions={showActions}
          locale={loc}
        />
      ))}
    </div>
  );
}
