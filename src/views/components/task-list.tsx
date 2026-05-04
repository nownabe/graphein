import type { InferSelectModel } from "drizzle-orm";
import type { tasks } from "../../infrastructure/db/schema";
import { t } from "../../domain/i18n/index";
import type { MrkdwnOptions } from "../../adapters/slack/mrkdwn";
import { TaskCard } from "./task-card";

type Task = InferSelectModel<typeof tasks> & {
  done: boolean;
  isOwner: boolean;
  isAssignee: boolean;
};

interface TaskGroup {
  key: string;
  label: string;
  tasks: Task[];
  variant?: "overdue";
}

function groupTasksByTime(taskList: Task[], locale: string): TaskGroup[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getTime() + 86400000);
  const weekEnd = new Date(todayStart.getTime() + 7 * 86400000);

  const overdue: Task[] = [];
  const today: Task[] = [];
  const thisWeek: Task[] = [];
  const later: Task[] = [];
  const noDueDate: Task[] = [];

  for (const task of taskList) {
    if (!task.deadline) {
      noDueDate.push(task);
      continue;
    }
    const dl = new Date(task.deadline);
    if (!task.done && dl < now) {
      overdue.push(task);
    } else if (dl >= todayStart && dl < tomorrowStart) {
      today.push(task);
    } else if (dl >= tomorrowStart && dl < weekEnd) {
      thisWeek.push(task);
    } else {
      later.push(task);
    }
  }

  const groups: TaskGroup[] = [];
  if (overdue.length > 0)
    groups.push({
      key: "overdue",
      label: t(locale, "section.overdue"),
      tasks: overdue,
      variant: "overdue",
    });
  if (today.length > 0)
    groups.push({
      key: "today",
      label: t(locale, "section.today"),
      tasks: today,
    });
  if (thisWeek.length > 0)
    groups.push({
      key: "thisWeek",
      label: t(locale, "section.thisWeek"),
      tasks: thisWeek,
    });
  if (later.length > 0)
    groups.push({
      key: "later",
      label: t(locale, "section.later"),
      tasks: later,
    });
  if (noDueDate.length > 0)
    groups.push({
      key: "noDueDate",
      label: t(locale, "section.noDueDate"),
      tasks: noDueDate,
    });

  return groups;
}

export type ProgressMap = Map<string, { total: number; done: number }>;

function TaskSection({
  group,
  showActions,
  locale,
  mrkdwnLabels,
  progressMap,
}: {
  group: TaskGroup;
  showActions?: boolean;
  locale: string;
  mrkdwnLabels?: MrkdwnOptions;
  progressMap?: ProgressMap;
}) {
  return (
    <div>
      <div class="flex items-center gap-3 mb-3">
        {group.variant === "overdue" && (
          <div class="w-2 h-2 rounded-full bg-danger animate-pulse shrink-0" />
        )}
        <span
          class={`text-xs font-semibold uppercase tracking-wider ${
            group.variant === "overdue" ? "text-danger" : "text-muted"
          }`}
        >
          {group.label}
        </span>
        <div class="flex-1 h-px bg-edge" />
        <span class="text-xs text-muted tabular-nums">{group.tasks.length}</span>
      </div>
      <div class="grid gap-1.5">
        {group.tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            done={task.done}
            isOwner={task.isOwner}
            isAssignee={task.isAssignee}
            showActions={showActions}
            locale={locale}
            mrkdwnLabels={mrkdwnLabels}
            progress={progressMap?.get(task.id)}
          />
        ))}
      </div>
    </div>
  );
}

export function TaskList({
  tasks: taskList,
  showActions,
  emptyMessage,
  locale,
  grouped,
  mrkdwnLabels,
  progressMap,
}: {
  tasks: Task[];
  showActions?: boolean;
  emptyMessage?: string;
  locale?: string;
  grouped?: boolean;
  mrkdwnLabels?: MrkdwnOptions;
  progressMap?: ProgressMap;
}) {
  const loc = locale ?? "en";

  if (taskList.length === 0) {
    return (
      <div class="text-center py-20">
        <div class="w-14 h-14 rounded-[var(--radius-lg)] bg-surface border border-edge flex items-center justify-center mx-auto mb-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" class="text-muted">
            <path
              d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
            <rect
              x="9"
              y="3"
              width="6"
              height="4"
              rx="1"
              stroke="currentColor"
              stroke-width="1.5"
            />
            <path
              d="M9 12h6M9 16h4"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </div>
        <p class="text-secondary text-sm whitespace-pre-line leading-relaxed">
          {emptyMessage ?? t(loc, "empty.default")}
        </p>
      </div>
    );
  }

  if (grouped) {
    const groups = groupTasksByTime(taskList, loc);
    return (
      <div class="space-y-8 stagger-in">
        {groups.map((group) => (
          <TaskSection
            key={group.key}
            group={group}
            showActions={showActions}
            locale={loc}
            mrkdwnLabels={mrkdwnLabels}
            progressMap={progressMap}
          />
        ))}
      </div>
    );
  }

  return (
    <div class="grid gap-1.5 stagger-in">
      {taskList.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          done={task.done}
          isOwner={task.isOwner}
          isAssignee={task.isAssignee}
          showActions={showActions}
          locale={loc}
          mrkdwnLabels={mrkdwnLabels}
          progress={progressMap?.get(task.id)}
        />
      ))}
    </div>
  );
}
