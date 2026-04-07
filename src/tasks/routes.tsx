import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { authMiddleware } from "../auth/middleware";
import {
  listActiveTasksForMember,
  listArchivedTasksForMember,
  getTask,
  isTaskOwner,
  isTaskAssignee,
  updateTask,
  toggleAssigneeDone,
  archiveTask,
  listTaskOwners,
  addTaskOwner,
  removeTaskOwner,
} from "./service";
import { findMemberBySlackUserId } from "../members/service";
import { HomePage, HomeTaskListPartial } from "../views/pages/home";
import { ArchivedPage } from "../views/pages/archived.tsx";
import { TaskEditPage } from "../views/pages/task-detail.tsx";
import { TaskCard } from "../views/components/task-card.tsx";

const taskRoutes = new Hono();

taskRoutes.use("*", authMiddleware);

function getLocale(c: { req: { raw: Request } }): string {
  const cookie = getCookie(c as any, "locale");
  return cookie === "en" ? "en" : "ja";
}

// Home - active tasks
taskRoutes.get("/", async (c) => {
  const { sub: memberId, name: displayName } = c.get("jwtPayload");
  const locale = getLocale(c);
  const filter = c.req.query("filter") ?? "all";
  let myTasks = await listActiveTasksForMember(memberId);

  if (filter === "open") {
    myTasks = myTasks.filter((t) => !t.done);
  } else if (filter === "done") {
    myTasks = myTasks.filter((t) => t.done);
  }

  // Check ownership for each task to determine if archive button should show
  const tasksWithOwnership = await Promise.all(
    myTasks.map(async (t) => ({
      ...t,
      isOwner: await isTaskOwner(t.id, memberId),
    })),
  );

  // htmx partial request — return just the task list (but not for boosted navigation)
  if (c.req.header("HX-Request") && !c.req.header("HX-Boosted")) {
    return c.html(
      <HomeTaskListPartial tasks={tasksWithOwnership} locale={locale} />,
    );
  }

  return c.html(
    <HomePage
      tasks={tasksWithOwnership}
      displayName={displayName}
      locale={locale}
      activeFilter={filter}
    />,
  );
});

// Archived tasks
taskRoutes.get("/archived", async (c) => {
  const { sub: memberId, name: displayName } = c.get("jwtPayload");
  const locale = getLocale(c);
  const archivedTasks = await listArchivedTasksForMember(memberId);
  const tasksWithOwnership = await Promise.all(
    archivedTasks.map(async (t) => ({
      ...t,
      isOwner: await isTaskOwner(t.id, memberId),
    })),
  );
  return c.html(
    <ArchivedPage
      tasks={tasksWithOwnership}
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
  if (!owner) return c.redirect("/");

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

  return c.redirect("/");
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
  return c.html(
    <TaskCard task={task} done={task.done} isOwner={owner} showActions locale={locale} />,
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
    <TaskEditPage
      task={task}
      owners={owners}
      displayName={c.get("jwtPayload").name}
      locale={locale}
    />,
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

  const result = await removeTaskOwner(taskId, targetMemberId);
  if (result.error === "cannot_remove_last_owner") {
    // Re-render the page with the current owners (no change)
    const task = await getTask(taskId);
    if (!task) return c.notFound();
    const owners = await listTaskOwners(taskId);
    return c.html(
      <TaskEditPage
        task={task}
        owners={owners}
        displayName={c.get("jwtPayload").name}
        locale={locale}
      />,
    );
  }

  const task = await getTask(taskId);
  if (!task) return c.notFound();
  const owners = await listTaskOwners(taskId);

  return c.html(
    <TaskEditPage
      task={task}
      owners={owners}
      displayName={c.get("jwtPayload").name}
      locale={locale}
    />,
  );
});

export default taskRoutes;
