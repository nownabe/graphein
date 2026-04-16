import type { InferSelectModel } from "drizzle-orm";
import type { tasks } from "../../db/schema";
import { t } from "../../i18n/index";
import type { MrkdwnOptions } from "../../slack/mrkdwn";
import { Layout } from "../layout";
import { Nav } from "../components/nav";
import { TaskList } from "../components/task-list";
import { ViewTabs } from "./home";

type Task = InferSelectModel<typeof tasks> & {
  done: boolean;
  isOwner: boolean;
  isAssignee: boolean;
};

export function ArchivedPage({
  tasks,
  displayName,
  avatarUrl,
  locale,
  theme,
  activeView,
  assignedCount,
  ownedCount,
  mrkdwnLabels,
  isAdmin,
  devMode,
}: {
  tasks: Task[];
  displayName: string;
  avatarUrl?: string | null;
  locale: string;
  theme?: string;
  activeView?: "assigned" | "owned";
  assignedCount: number;
  ownedCount: number;
  mrkdwnLabels?: MrkdwnOptions;
  isAdmin?: boolean;
  devMode?: boolean;
}) {
  const view = activeView ?? "assigned";
  return (
    <Layout title={t(locale, "page.archived")} locale={locale} theme={theme} devMode={devMode}>
      <Nav displayName={displayName} avatarUrl={avatarUrl} locale={locale} theme={theme} isAdmin={isAdmin} />
      <main class="max-w-3xl mx-auto px-6 py-10">
        <div class="flex items-center justify-between mb-6">
          <h1 class="text-xl font-bold text-ink tracking-tight">{t(locale, "page.archived")}</h1>
          <a href="/tasks" class="text-xs text-muted hover:text-accent transition-colors">
            {t(locale, "link.backToMyTasks")}
          </a>
        </div>
        <ViewTabs
          activeView={view}
          locale={locale}
          assignedCount={assignedCount}
          ownedCount={ownedCount}
          baseUrl="/tasks/archived"
        />
        <TaskList
          tasks={tasks}
          showActions
          emptyMessage={t(locale, "empty.archived")}
          locale={locale}
          mrkdwnLabels={mrkdwnLabels}
        />
      </main>
    </Layout>
  );
}
