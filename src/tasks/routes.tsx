import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { authMiddleware } from "../auth/middleware";
import {
  listActiveTasksForMember,
  listArchivedTasksForMember,
  getTask,
  isTaskOwner,
  updateTask,
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
    myTasks = myTasks.filter((t) => t.status === "open");
  } else if (filter === "done") {
    myTasks = myTasks.filter((t) => t.status === "done");
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

// Update task status (htmx inline)
taskRoutes.patch("/tasks/:id/status", async (c) => {
  const taskId = c.req.param("id");
  const { sub: memberId } = c.get("jwtPayload");
  const locale = getLocale(c);

  const owner = await isTaskOwner(taskId, memberId);
  if (!owner) return c.text("Forbidden", 403);

  const body = await c.req.parseBody();
  const status = body.status as "open" | "done" | "archived";
  const task = await updateTask(taskId, { status });

  // If archived, remove the card from the list
  if (status === "archived") {
    return c.body(null, 200);
  }

  // Return updated card
  return c.html(<TaskCard task={task} showActions locale={locale} />);
});

export default taskRoutes;
