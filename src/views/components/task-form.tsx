import type { InferSelectModel } from "drizzle-orm";
import type { tasks } from "../../db/schema";

type Task = InferSelectModel<typeof tasks>;

export function TaskForm({ task }: { task: Task }) {
  const deadlineValue = task.deadline
    ? new Date(task.deadline).toISOString().split("T")[0]
    : "";

  return (
    <form
      hx-put={`/tasks/${task.id}`}
      hx-target="body"
      class="space-y-4"
    >
      <div>
        <label for="title" class="block text-sm font-medium text-gray-700">
          タイトル
        </label>
        <input
          type="text"
          id="title"
          name="title"
          value={task.title}
          required
          class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label
          for="description"
          class="block text-sm font-medium text-gray-700"
        >
          説明
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
        >
          {task.description ?? ""}
        </textarea>
      </div>

      <div>
        <label for="deadline" class="block text-sm font-medium text-gray-700">
          期限
        </label>
        <input
          type="date"
          id="deadline"
          name="deadline"
          value={deadlineValue}
          class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
        />
      </div>

      <div class="flex gap-3">
        <button
          type="submit"
          class="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors"
        >
          保存
        </button>
        <a
          href={`/tasks/${task.id}`}
          class="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          キャンセル
        </a>
      </div>
    </form>
  );
}
