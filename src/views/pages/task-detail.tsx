import type { InferSelectModel } from "drizzle-orm";
import type { tasks, members } from "../../db/schema";
import { t } from "../../i18n/index";
import { Layout } from "../layout";
import { Nav } from "../components/nav";

type Task = InferSelectModel<typeof tasks>;
type Member = InferSelectModel<typeof members>;

export function TaskEditPage({
  task,
  owners,
  displayName,
  locale,
}: {
  task: Task;
  owners: Member[];
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
          class="text-sm text-warm-500 hover:text-vermillion-500 transition-colors mb-4 inline-block"
        >
          {t(locale, "link.backToMyTasksFromEdit")}
        </a>
        <h1 class="font-display text-3xl font-semibold text-ink tracking-wide mb-6">
          {t(locale, "page.editTask")}
        </h1>

        <form
          method="post"
          action={`/tasks/${task.id}`}
          class="bg-cream rounded-lg border border-warm-200 p-6 space-y-5"
        >
          <div>
            <label
              for="title"
              class="block text-sm font-medium text-warm-700 mb-1"
            >
              {t(locale, "form.title")}
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={task.title}
              required
              class="block w-full rounded-md border border-warm-200 bg-white px-3 py-2 text-ink shadow-sm transition-colors"
            />
          </div>

          <div>
            <label
              for="description"
              class="block text-sm font-medium text-warm-700 mb-1"
            >
              {t(locale, "form.description")}
            </label>
            <textarea
              id="description"
              name="description"
              rows={4}
              class="block w-full rounded-md border border-warm-200 bg-white px-3 py-2 text-ink shadow-sm transition-colors"
            >
              {task.description ?? ""}
            </textarea>
          </div>

          <div>
            <label
              for="deadline"
              class="block text-sm font-medium text-warm-700 mb-1"
            >
              {t(locale, "form.deadline")}
            </label>
            <input
              type="datetime-local"
              id="deadline"
              name="deadline"
              value={deadlineValue}
              step="60"
              class="block w-full rounded-md border border-warm-200 bg-white px-3 py-2 text-ink shadow-sm transition-colors"
            />
          </div>

          <div class="flex gap-3 pt-2">
            <button
              type="submit"
              class="bg-vermillion-500 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-vermillion-600 transition-colors shadow-sm"
            >
              {t(locale, "button.save")}
            </button>
            <a
              href="/"
              class="px-5 py-2 rounded-md border border-warm-200 text-warm-600 text-sm hover:bg-warm-50 transition-colors"
            >
              {t(locale, "button.cancel")}
            </a>
          </div>
        </form>

        {/* Owners section */}
        <div class="mt-8 bg-cream rounded-lg border border-warm-200 p-6">
          <h2 class="font-display text-xl font-semibold text-ink mb-4">
            {t(locale, "owners.title")}
          </h2>

          <ul class="space-y-2 mb-4">
            {owners.map((owner) => (
              <li key={owner.id} class="flex items-center justify-between py-2 px-3 rounded-md hover:bg-warm-50 transition-colors">
                <span class="text-sm text-ink">{owner.displayName}</span>
                {owners.length > 1 && (
                  <button
                    hx-delete={`/tasks/${task.id}/owners/${owner.id}`}
                    hx-target="closest main"
                    hx-swap="outerHTML"
                    hx-confirm={t(locale, "confirm.removeOwner")}
                    class="text-xs px-2 py-1 rounded border border-warm-200 text-warm-400 hover:text-vermillion-500 hover:border-vermillion-500/30 transition-colors"
                  >
                    {t(locale, "button.remove")}
                  </button>
                )}
              </li>
            ))}
          </ul>

          <form
            hx-post={`/tasks/${task.id}/owners`}
            hx-target="closest main"
            hx-swap="outerHTML"
            class="flex gap-2"
          >
            <input
              type="text"
              name="slack_user_id"
              placeholder={t(locale, "owners.slackUserIdPlaceholder")}
              required
              class="flex-1 rounded-md border border-warm-200 bg-white px-3 py-2 text-sm text-ink shadow-sm transition-colors"
            />
            <button
              type="submit"
              class="text-sm px-4 py-2 rounded-md bg-vermillion-500 text-white font-medium hover:bg-vermillion-600 transition-colors shadow-sm"
            >
              {t(locale, "button.addOwner")}
            </button>
          </form>
        </div>
      </main>
    </Layout>
  );
}
