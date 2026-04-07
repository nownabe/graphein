import type { InferSelectModel } from "drizzle-orm";
import type { tasks } from "../../db/schema";
import { TaskCard } from "./task-card";

type Task = InferSelectModel<typeof tasks>;

export function TaskList({
  tasks,
  showActions,
  emptyMessage,
}: {
  tasks: Task[];
  showActions?: boolean;
  emptyMessage?: string;
}) {
  if (tasks.length === 0) {
    return (
      <div class="text-center py-12 text-gray-500">
        <p class="text-lg">{emptyMessage ?? "タスクはありません"}</p>
      </div>
    );
  }

  return (
    <div class="grid gap-3">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} showActions={showActions} />
      ))}
    </div>
  );
}
