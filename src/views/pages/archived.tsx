import type { InferSelectModel } from "drizzle-orm";
import type { tasks } from "../../db/schema";
import { Layout } from "../layout";
import { Nav } from "../components/nav";
import { TaskList } from "../components/task-list";

type Task = InferSelectModel<typeof tasks>;

export function ArchivedPage({
  tasks,
  displayName,
}: {
  tasks: Task[];
  displayName: string;
}) {
  return (
    <Layout title="アーカイブ済み">
      <Nav displayName={displayName} />
      <main class="max-w-3xl mx-auto px-4 py-8">
        <div class="flex items-center gap-4 mb-6">
          <a href="/" class="text-sm text-indigo-600 hover:text-indigo-800">
            ← マイタスク
          </a>
          <h1 class="text-2xl font-bold text-gray-900">アーカイブ済み</h1>
        </div>
        <TaskList
          tasks={tasks}
          emptyMessage="アーカイブ済みのタスクはありません"
        />
      </main>
    </Layout>
  );
}
