import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { authMiddleware } from "../auth/middleware";
import {
  listActiveTasksForMember,
  listArchivedTasksForMember,
  listOwnedOnlyActiveTasksForMember,
  getTask,
  isTaskOwner,
  isTaskAssignee,
  updateTask,
  toggleAssigneeDone,
  archiveTask,
  unarchiveTask,
  listTaskOwners,
  listTaskAssigneesWithStatus,
  addTaskOwner,
  removeTaskOwner,
} from "./service";
import { findMemberBySlackUserId } from "../members/service";
import { buildMrkdwnLabels } from "../slack/labels";
import { HomePage, HomeContentPartial } from "../views/pages/home";
import type { FilterCounts } from "../views/pages/home";
import { ArchivedPage } from "../views/pages/archived.tsx";
import { TaskEditPage, OwnersPartial } from "../views/pages/task-detail.tsx";
import { TaskStatusPage } from "../views/pages/task-status.tsx";
import { TaskCard } from "../views/components/task-card.tsx";

const taskRoutes = new Hono();

taskRoutes.use("*", authMiddleware);

function getLocale(c: { req: { raw: Request } }): string {
  const cookie = getCookie(c as any, "locale");
  return cookie === "en" ? "en" : "ja";
}

async function buildHomeData(memberId: string, filter: string) {
  const allAssignedTasks = await listActiveTasksForMember(memberId);
  const ownedOnlyTasks = await listOwnedOnlyActiveTasksForMember(memberId);

  const now = new Date();
  const counts: FilterCounts = {
    all: allAssignedTasks.length + ownedOnlyTasks.length,
    open:
      allAssignedTasks.filter((t) => !t.done).length + ownedOnlyTasks.length,
    done: allAssignedTasks.filter((t) => t.done).length,
  };
  const overdueCount =
    allAssignedTasks.filter(
      (t) => !t.done && t.deadline && new Date(t.deadline) < now,
    ).length +
    ownedOnlyTasks.filter((t) => t.deadline && new Date(t.deadline) < now)
      .length;

  let filteredAssigned = allAssignedTasks;
  if (filter === "open") {
    filteredAssigned = allAssignedTasks.filter((t) => !t.done);
  } else if (filter === "done") {
    filteredAssigned = allAssignedTasks.filter((t) => t.done);
  }

  const assignedWithOwnership = await Promise.all(
    filteredAssigned.map(async (t) => ({
      ...t,
      isOwner: await isTaskOwner(t.id, memberId),
      isAssignee: true,
    })),
  );

  const ownedOnlyWithFlags = ownedOnlyTasks.map((t) => ({
    ...t,
    done: false,
    isOwner: true,
    isAssignee: false,
  }));

  const filteredOwnedOnly = filter === "done" ? [] : ownedOnlyWithFlags;
  const allTasks = [...assignedWithOwnership, ...filteredOwnedOnly];

  return { allTasks, counts, overdueCount };
}

// Redirect root to the task list
taskRoutes.get("/", (c) => c.redirect("/tasks"));

// Task list - active tasks
taskRoutes.get("/tasks", async (c) => {
  const { sub: memberId, name: displayName } = c.get("jwtPayload");
  const locale = getLocale(c);
  const filter = c.req.query("filter") ?? "all";

  const { allTasks, counts, overdueCount } = await buildHomeData(
    memberId,
    filter,
  );
  const mrkdwnLabels = await buildMrkdwnLabels(
    allTasks.map((t) => t.description),
  );

  // htmx partial request — return summary + tabs + task list
  if (c.req.header("HX-Request") && !c.req.header("HX-Boosted")) {
    return c.html(
      <HomeContentPartial
        tasks={allTasks}
        locale={locale}
        activeFilter={filter}
        counts={counts}
        overdueCount={overdueCount}
        mrkdwnLabels={mrkdwnLabels}
      />,
    );
  }

  return c.html(
    <HomePage
      tasks={allTasks}
      displayName={displayName}
      locale={locale}
      activeFilter={filter}
      counts={counts}
      overdueCount={overdueCount}
      mrkdwnLabels={mrkdwnLabels}
    />,
  );
});

// Archived tasks
taskRoutes.get("/tasks/archived", async (c) => {
  const { sub: memberId, name: displayName } = c.get("jwtPayload");
  const locale = getLocale(c);
  const archivedTasks = await listArchivedTasksForMember(memberId);
  const tasksWithOwnership = await Promise.all(
    archivedTasks.map(async (t) => ({
      ...t,
      isOwner: await isTaskOwner(t.id, memberId),
      isAssignee: true,
    })),
  );
  const mrkdwnLabels = await buildMrkdwnLabels(
    tasksWithOwnership.map((t) => t.description),
  );
  return c.html(
    <ArchivedPage
      tasks={tasksWithOwnership}
      displayName={displayName}
      locale={locale}
      mrkdwnLabels={mrkdwnLabels}
    />,
  );
});

// Task status — assignee completion (owner only)
taskRoutes.get("/tasks/:id/status", async (c) => {
  const taskId = c.req.param("id");
  const { sub: memberId, name: displayName } = c.get("jwtPayload");
  const locale = getLocale(c);

  const task = await getTask(taskId);
  if (!task) return c.notFound();

  const owner = await isTaskOwner(taskId, memberId);
  if (!owner) return c.redirect("/tasks");

  const assignees = await listTaskAssigneesWithStatus(taskId);

  return c.html(
    <TaskStatusPage
      task={task}
      assignees={assignees}
      displayName={displayName}
      locale={locale}
    />,
  );
});

// Task edit form (owner only)
taskRoutes.get("/tasks/:id/edit", async (c) => {
  const taskId = c.req.param("id");
  const { sub: memberId, name: displayName } = c.get("jwtPayload");
  const locale = getLocale(c);

  const task = await getTask(taskId);
  if (!task) return c.notFound();

  const owner = await isTaskOwner(taskId, memberId);
  if (!owner) return c.redirect("/tasks");

  const owners = await listTaskOwners(taskId);

  return c.html(
    <TaskEditPage
      task={task}
      owners={owners}
      displayName={displayName}
      locale={locale}
    />,
  );
});

// Update task (owner only)
taskRoutes.post("/tasks/:id", async (c) => {
  const taskId = c.req.param("id");
  const { sub: memberId } = c.get("jwtPayload");

  const owner = await isTaskOwner(taskId, memberId);
  if (!owner) return c.text("Forbidden", 403);

  const body = await c.req.parseBody();
  await updateTask(taskId, {
    title: body.title as string,
    description: (body.description as string) || null,
    deadline: body.deadline ? new Date(body.deadline as string) : null,
  });

  return c.redirect("/tasks");
});

// Toggle assignee done status (assignee only)
taskRoutes.patch("/tasks/:id/done", async (c) => {
  const taskId = c.req.param("id");
  const { sub: memberId } = c.get("jwtPayload");
  const locale = getLocale(c);

  const assignee = await isTaskAssignee(taskId, memberId);
  if (!assignee) return c.text("Forbidden", 403);

  const task = await toggleAssigneeDone(taskId, memberId);
  if (!task) return c.notFound();

  const owner = await isTaskOwner(taskId, memberId);
  const mrkdwnLabels = await buildMrkdwnLabels([task.description]);
  return c.html(
    <TaskCard
      task={task}
      done={task.done}
      isOwner={owner}
      isAssignee
      showActions
      locale={locale}
      mrkdwnLabels={mrkdwnLabels}
    />,
  );
});

// Archive task (owner only)
taskRoutes.patch("/tasks/:id/archive", async (c) => {
  const taskId = c.req.param("id");
  const { sub: memberId } = c.get("jwtPayload");

  const owner = await isTaskOwner(taskId, memberId);
  if (!owner) return c.text("Forbidden", 403);

  await archiveTask(taskId);

  // Remove the card from the list
  return c.body(null, 200);
});

// Unarchive task (owner only)
taskRoutes.patch("/tasks/:id/unarchive", async (c) => {
  const taskId = c.req.param("id");
  const { sub: memberId } = c.get("jwtPayload");

  const owner = await isTaskOwner(taskId, memberId);
  if (!owner) return c.text("Forbidden", 403);

  await unarchiveTask(taskId);

  // Remove the card from the archived list
  return c.body(null, 200);
});

// Add task owner (owner only)
taskRoutes.post("/tasks/:id/owners", async (c) => {
  const taskId = c.req.param("id");
  const { sub: memberId } = c.get("jwtPayload");
  const locale = getLocale(c);

  const owner = await isTaskOwner(taskId, memberId);
  if (!owner) return c.text("Forbidden", 403);

  const body = await c.req.parseBody();
  const slackUserId = (body.slack_user_id as string)?.trim();
  if (!slackUserId) return c.text("Bad Request", 400);

  const member = await findMemberBySlackUserId(slackUserId);
  if (!member) return c.text("Member not found", 404);

  await addTaskOwner(taskId, member.id);

  const task = await getTask(taskId);
  if (!task) return c.notFound();
  const owners = await listTaskOwners(taskId);

  return c.html(
    <OwnersPartial task={task} owners={owners} locale={locale} />,
  );
});

// Remove task owner (owner only)
taskRoutes.delete("/tasks/:id/owners/:memberId", async (c) => {
  const taskId = c.req.param("id");
  const targetMemberId = c.req.param("memberId");
  const { sub: memberId } = c.get("jwtPayload");
  const locale = getLocale(c);

  const owner = await isTaskOwner(taskId, memberId);
  if (!owner) return c.text("Forbidden", 403);

  await removeTaskOwner(taskId, targetMemberId);

  const task = await getTask(taskId);
  if (!task) return c.notFound();
  const owners = await listTaskOwners(taskId);

  return c.html(
    <OwnersPartial task={task} owners={owners} locale={locale} />,
  );
});

export default taskRoutes;
