import type { InferSelectModel } from "drizzle-orm";
import type { tasks, members } from "../../db/schema";
import { t } from "../../i18n/index";
import { Layout } from "../layout";
import { Nav } from "../components/nav";

type Task = InferSelectModel<typeof tasks>;
type Member = InferSelectModel<typeof members>;

export function OwnersPartial({
  task,
  owners,
  locale,
}: {
  task: Task;
  owners: Member[];
  locale: string;
}) {
  return (
    <div
      id="owners-section"
      class="mt-8 bg-surface border border-edge rounded-[var(--radius-lg)] p-6"
    >
      <h2 class="text-sm font-semibold text-ink mb-5">
        {t(locale, "owners.title")}
      </h2>

      <ul class="space-y-1 mb-5">
        {owners.map((owner) => (
          <li
            key={owner.id}
            class="flex items-center justify-between py-2.5 px-3 rounded-[var(--radius-sm)] hover:bg-surface-hover transition-colors"
          >
            <span class="text-sm text-ink">{owner.displayName}</span>
            {owners.length > 1 && (
              <button
                hx-delete={`/tasks/${task.id}/owners/${owner.id}`}
                hx-target="#owners-section"
                hx-swap="outerHTML"
                hx-confirm={t(locale, "confirm.removeOwner")}
                class="text-xs px-2.5 py-1.5 rounded-[var(--radius-sm)] text-muted hover:text-danger hover:bg-[var(--color-glow-danger)] transition-colors"
              >
                {t(locale, "button.remove")}
              </button>
            )}
          </li>
        ))}
      </ul>

      <div class="relative">
        <input
          type="text"
          name="q"
          autocomplete="off"
          placeholder={t(locale, "owners.searchPlaceholder")}
          hx-get={`/tasks/${task.id}/owners/search`}
          hx-trigger="input changed delay:150ms, focus"
          hx-target="#owner-search-results"
          hx-swap="innerHTML"
          class="block w-full rounded-[var(--radius-sm)] border border-edge bg-page px-4 py-2.5 text-sm text-ink placeholder:text-muted transition-colors"
        />
        <div id="owner-search-results" class="mt-2" />
      </div>
    </div>
  );
}

export function OwnerSearchResults({
  taskId,
  results,
  locale,
}: {
  taskId: string;
  results: Member[];
  locale: string;
}) {
  if (results.length === 0) {
    return (
      <p class="text-xs text-muted px-3 py-2">
        {t(locale, "owners.searchNoResults")}
      </p>
    );
  }
  return (
    <ul class="border border-edge rounded-[var(--radius-sm)] bg-page divide-y divide-edge overflow-hidden">
      {results.map((m) => (
        <li key={m.id}>
          <button
            type="button"
            hx-post={`/tasks/${taskId}/owners`}
            hx-vals={JSON.stringify({ member_id: m.id })}
            hx-target="#owners-section"
            hx-swap="outerHTML"
            class="w-full text-left px-3 py-2 text-sm text-ink hover:bg-surface-hover transition-colors cursor-pointer flex items-center justify-between"
          >
            <span>{m.displayName}</span>
            <span class="text-xs text-muted">{m.email}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function TaskEditContent({
  task,
  owners,
  locale,
}: {
  task: Task;
  owners: Member[];
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
    <main class="max-w-3xl mx-auto px-6 py-10">
      <a
        href="/tasks"
        class="text-xs text-muted hover:text-accent transition-colors mb-4 inline-flex items-center gap-1"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          class="shrink-0"
        >
          <path
            d="M8.5 3.5L5 7l3.5 3.5"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        {t(locale, "link.backToMyTasks")}
      </a>
      <div class="mb-8">
        <h1 class="text-xl font-bold text-ink tracking-tight mb-1">
          {task.title}
        </h1>
        <p class="text-sm text-secondary">{t(locale, "page.editTask")}</p>
      </div>

      <form
        method="post"
        action={`/tasks/${task.id}`}
        class="bg-surface border border-edge rounded-[var(--radius-lg)] p-6 space-y-5"
      >
        <div>
          <label
            for="title"
            class="block text-xs font-semibold text-secondary uppercase tracking-wider mb-1.5"
          >
            {t(locale, "form.title")}
          </label>
          <input
            type="text"
            id="title"
            name="title"
            value={task.title}
            required
            class="block w-full rounded-[var(--radius-sm)] border border-edge bg-page px-4 py-2.5 text-sm text-ink placeholder:text-muted transition-colors"
          />
        </div>

        <div>
          <label
            for="description"
            class="block text-xs font-semibold text-secondary uppercase tracking-wider mb-1.5"
          >
            {t(locale, "form.description")}
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            class="block w-full rounded-[var(--radius-sm)] border border-edge bg-page px-4 py-2.5 text-sm text-ink placeholder:text-muted transition-colors"
          >{task.description ?? ""}</textarea>
        </div>

        <div>
          <label
            for="deadline"
            class="block text-xs font-semibold text-secondary uppercase tracking-wider mb-1.5"
          >
            {t(locale, "form.deadline")}
          </label>
          <input
            type="datetime-local"
            id="deadline"
            name="deadline"
            value={deadlineValue}
            step="60"
            class="block w-full rounded-[var(--radius-sm)] border border-edge bg-page px-4 py-2.5 text-sm text-ink transition-colors"
          />
        </div>

        <div class="flex gap-3 pt-3">
          <button
            type="submit"
            class="bg-accent text-page px-6 py-2.5 rounded-[var(--radius-sm)] text-sm font-semibold hover:bg-accent-hover transition-colors"
          >
            {t(locale, "button.save")}
          </button>
          <a
            href="/tasks"
            class="px-6 py-2.5 rounded-[var(--radius-sm)] text-sm text-secondary hover:text-ink hover:bg-surface-hover transition-colors"
          >
            {t(locale, "button.cancel")}
          </a>
        </div>
      </form>

      <OwnersPartial task={task} owners={owners} locale={locale} />
    </main>
  );
}

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
  return (
    <Layout
      title={`${task.title} | ${t(locale, "page.editTask")}`}
      locale={locale}
    >
      <Nav displayName={displayName} locale={locale} />
      <TaskEditContent task={task} owners={owners} locale={locale} />
    </Layout>
  );
}
