import type { InferSelectModel } from "drizzle-orm";
import type { tasks } from "../../db/schema";
import { t } from "../../i18n/index";
import { Layout } from "../layout";
import { Nav } from "../components/nav";

type Task = InferSelectModel<typeof tasks>;

export function TaskEditPage({
  task,
  displayName,
  locale,
}: {
  task: Task;
  displayName: string;
  locale: string;
}) {
  const deadlineValue = task.deadline
    ? (() => {
        const d = new Date(task.deadline);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const hh = String(d.getHours()).padStart(2, "0");
        const min = String(d.getMinutes()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
      })()
    : "";

  return (
    <Layout title={t(locale, "page.editTask")} locale={locale}>
      <Nav displayName={displayName} locale={locale} />
      <main class="max-w-3xl mx-auto px-4 py-8">
        <a
          href="/"
          class="text-sm text-indigo-600 hover:text-indigo-800 mb-4 inline-block"
        >
          {t(locale, "link.backToMyTasksFromEdit")}
        </a>
        <h1 class="text-2xl font-bold text-gray-900 mb-6">
          {t(locale, "page.editTask")}
        </h1>

        <form
          method="post"
          action={`/tasks/${task.id}`}
          class="bg-white rounded-lg border border-gray-200 p-6 space-y-4"
        >
          <div>
            <label
              for="title"
              class="block text-sm font-medium text-gray-700"
            >
              {t(locale, "form.title")}
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
              {t(locale, "form.description")}
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
            <label
              for="deadline"
              class="block text-sm font-medium text-gray-700"
            >
              {t(locale, "form.deadline")}
            </label>
            <input
              type="datetime-local"
              id="deadline"
              name="deadline"
              value={deadlineValue}
              step="60"
              class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>

          <div class="flex gap-3 pt-2">
            <button
              type="submit"
              class="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors"
            >
              {t(locale, "button.save")}
            </button>
            <a
              href="/"
              class="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {t(locale, "button.cancel")}
            </a>
          </div>
        </form>
      </main>
    </Layout>
  );
}
