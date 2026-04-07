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
        <h1 class="text-2xl font-bold text-gray-900 mb-6">マイタスク</h1>
        <div id="task-list">
          <TaskList tasks={tasks} />
        </div>
      </main>
    </Layout>
  );
}

export function HomePartial({ tasks }: { tasks: Task[] }) {
  return <TaskList tasks={tasks} />;
}
