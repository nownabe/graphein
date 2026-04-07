import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { authMiddleware } from "../auth/middleware";
import {
  listActiveTasksForMember,
  listArchivedTasksForMember,
  getTask,
  isTaskOwner,
  updateTask,
  toggleAssigneeDone,
  archiveTask,
} from "./service";
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

  // htmx partial request — return just the task list (but not for boosted navigation)
  if (c.req.header("HX-Request") && !c.req.header("HX-Boosted")) {
    return c.html(
      <HomeTaskListPartial tasks={myTasks} locale={locale} />,
    );
  }

  return c.html(
    <HomePage
      tasks={myTasks}
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
  return c.html(
    <ArchivedPage
      tasks={archivedTasks}
      displayName={displayName}
      locale={locale}
    />,
  );
});

// Task edit form
taskRoutes.get("/tasks/:id/edit", async (c) => {
  const taskId = c.req.param("id");
  const { sub: memberId, name: displayName } = c.get("jwtPayload");
  const locale = getLocale(c);

  const task = await getTask(taskId);
  if (!task) return c.notFound();

  const owner = await isTaskOwner(taskId, memberId);
  if (!owner) return c.redirect("/");

  return c.html(
    <TaskEditPage task={task} displayName={displayName} locale={locale} />,
  );
});

// Update task
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

// Toggle assignee done status (htmx inline)
taskRoutes.patch("/tasks/:id/done", async (c) => {
  const taskId = c.req.param("id");
  const { sub: memberId } = c.get("jwtPayload");
  const locale = getLocale(c);

  const owner = await isTaskOwner(taskId, memberId);
  if (!owner) return c.text("Forbidden", 403);

  const task = await toggleAssigneeDone(taskId, memberId);
  if (!task) return c.notFound();

  return c.html(<TaskCard task={task} done={task.done} showActions locale={locale} />);
});

// Archive task (htmx inline)
taskRoutes.patch("/tasks/:id/archive", async (c) => {
  const taskId = c.req.param("id");
  const { sub: memberId } = c.get("jwtPayload");

  const owner = await isTaskOwner(taskId, memberId);
  if (!owner) return c.text("Forbidden", 403);

  await archiveTask(taskId);

  // Remove the card from the list
  return c.body(null, 200);
});

export default taskRoutes;
