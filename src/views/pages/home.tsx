import type { InferSelectModel } from "drizzle-orm";
import type { tasks } from "../../db/schema";
import { Layout } from "../layout";
import { Nav } from "../components/nav";
import { TaskList } from "../components/task-list";

type Task = InferSelectModel<typeof tasks>;

export function HomePage({
  tasks,
  displayName,
}: {
  tasks: Task[];
  displayName: string;
}) {
  return (
    <Layout title="マイタスク">
      <Nav displayName={displayName} />
      <main class="max-w-3xl mx-auto px-4 py-8">
        <div class="flex items-center justify-between mb-6">
          <h1 class="text-2xl font-bold text-gray-900">マイタスク</h1>
          <a
            href="/archived"
            class="text-sm text-gray-500 hover:text-gray-700"
          >
            アーカイブ済み →
          </a>
        </div>
        <div id="task-list">
          <TaskList
            tasks={tasks}
            showActions
            emptyMessage="タスクはまだありません。Slack のショートカットからタスクを作成できます。"
          />
        </div>
      </main>
    </Layout>
  );
}
