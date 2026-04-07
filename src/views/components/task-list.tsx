import type { InferSelectModel } from "drizzle-orm";
import type { tasks } from "../../db/schema";
import { TaskCard } from "./task-card";

type Task = InferSelectModel<typeof tasks>;

export function TaskList({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) {
    return (
      <div class="text-center py-12 text-gray-500">
        <p class="text-lg">タスクはまだありません</p>
        <p class="text-sm mt-1">Slack のショートカットからタスクを作成できます</p>
      </div>
    );
  }

  return (
    <div class="grid gap-3">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
    </div>
  );
}
