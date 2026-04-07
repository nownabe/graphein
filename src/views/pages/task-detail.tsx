import type { InferSelectModel } from "drizzle-orm";
import type { tasks, members } from "../../db/schema";
import { Layout } from "../layout";
import { Nav } from "../components/nav";
import { TaskForm } from "../components/task-form";

type Task = InferSelectModel<typeof tasks>;
type Member = InferSelectModel<typeof members>;

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

const nextStatus: Record<string, string> = {
  open: "done",
  done: "open",
};

const nextStatusAction: Record<string, string> = {
  open: "完了にする",
  done: "未完了に戻す",
};

export function TaskDetailPage({
  task,
  assignees,
  displayName,
  isOwner,
  editing,
}: {
  task: Task;
  assignees: Member[];
  displayName: string;
  isOwner: boolean;
  editing?: boolean;
}) {
  const deadlineStr = task.deadline
    ? new Date(task.deadline).toLocaleDateString("ja-JP")
    : "未設定";

  return (
    <Layout title={task.title}>
      <Nav displayName={displayName} />
      <main class="max-w-3xl mx-auto px-4 py-8">
        <a
          href="/"
          class="text-sm text-indigo-600 hover:text-indigo-800 mb-4 inline-block"
        >
          ← マイタスクに戻る
        </a>

        {editing && isOwner ? (
          <TaskForm task={task} />
        ) : (
          <div class="bg-white rounded-lg border border-gray-200 p-6">
            <div class="flex items-start justify-between gap-4 mb-4">
              <h1 class="text-xl font-bold text-gray-900">{task.title}</h1>
              <span
                class={`shrink-0 text-sm font-medium px-3 py-1 rounded-full ${statusColor[task.status]}`}
              >
                {statusLabel[task.status]}
              </span>
            </div>

            {task.description && (
              <p class="text-gray-700 whitespace-pre-wrap mb-4">
                {task.description}
              </p>
            )}

            <dl class="grid grid-cols-2 gap-4 text-sm mb-6">
              <div>
                <dt class="text-gray-500">期限</dt>
                <dd class="text-gray-900">{deadlineStr}</dd>
              </div>
              <div>
                <dt class="text-gray-500">担当者</dt>
                <dd class="text-gray-900">
                  {assignees.length > 0
                    ? assignees.map((a) => a.displayName).join(", ")
                    : "未割り当て"}
                </dd>
              </div>
              {task.slackPermalink && (
                <div class="col-span-2">
                  <dt class="text-gray-500">Slack メッセージ</dt>
                  <dd>
                    <a
                      href={task.slackPermalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-indigo-600 hover:text-indigo-800"
                    >
                      元のメッセージを開く
                    </a>
                  </dd>
                </div>
              )}
            </dl>

            {isOwner && task.status !== "archived" && (
              <div class="flex gap-3 border-t border-gray-200 pt-4">
                <button
                  hx-patch={`/tasks/${task.id}/status`}
                  hx-vals={JSON.stringify({
                    status: nextStatus[task.status],
                  })}
                  hx-target="body"
                  class="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700 transition-colors"
                >
                  {nextStatusAction[task.status]}
                </button>
                <a
                  href={`/tasks/${task.id}/edit`}
                  class="px-4 py-2 rounded-md border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition-colors"
                >
                  編集
                </a>
                <button
                  hx-patch={`/tasks/${task.id}/status`}
                  hx-vals={JSON.stringify({ status: "archived" })}
                  hx-target="body"
                  class="ml-auto px-4 py-2 rounded-md text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  アーカイブ
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </Layout>
  );
}
