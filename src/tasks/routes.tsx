import { Hono } from "hono";
import { authMiddleware } from "../auth/middleware";
import {
  listTasksForMember,
  getTask,
  getTaskAssignees,
  isTaskOwner,
  updateTask,
} from "./service";
import { HomePage, HomePartial } from "../views/pages/home";
import { TaskDetailPage } from "../views/pages/task-detail";

const taskRoutes = new Hono();

taskRoutes.use("*", authMiddleware);

// Home - my tasks
taskRoutes.get("/", async (c) => {
  const { sub: memberId, name: displayName } = c.get("jwtPayload");
  const myTasks = await listTasksForMember(memberId);

  if (c.req.header("HX-Request")) {
    return c.html(<HomePartial tasks={myTasks} />);
  }
  return c.html(<HomePage tasks={myTasks} displayName={displayName} />);
});

// Task detail
taskRoutes.get("/tasks/:id", async (c) => {
  const taskId = c.req.param("id");
  const { sub: memberId, name: displayName } = c.get("jwtPayload");

  const task = await getTask(taskId);
  if (!task) return c.notFound();

  const assignees = await getTaskAssignees(taskId);
  const owner = await isTaskOwner(taskId, memberId);

  return c.html(
    <TaskDetailPage
      task={task}
      assignees={assignees}
      displayName={displayName}
      isOwner={owner}
    />,
  );
});

// Task edit form
taskRoutes.get("/tasks/:id/edit", async (c) => {
  const taskId = c.req.param("id");
  const { sub: memberId, name: displayName } = c.get("jwtPayload");

  const task = await getTask(taskId);
  if (!task) return c.notFound();

  const assignees = await getTaskAssignees(taskId);
  const owner = await isTaskOwner(taskId, memberId);
  if (!owner) return c.redirect(`/tasks/${taskId}`);

  return c.html(
    <TaskDetailPage
      task={task}
      assignees={assignees}
      displayName={displayName}
      isOwner={owner}
      editing
    />,
  );
});

// Update task
taskRoutes.put("/tasks/:id", async (c) => {
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

  return c.redirect(`/tasks/${taskId}`);
});

// Update task status
taskRoutes.patch("/tasks/:id/status", async (c) => {
  const taskId = c.req.param("id");
  const { sub: memberId } = c.get("jwtPayload");

  const owner = await isTaskOwner(taskId, memberId);
  if (!owner) return c.text("Forbidden", 403);

  const body = await c.req.parseBody();
  const status = body.status as "open" | "in_progress" | "done";
  await updateTask(taskId, { status });

  return c.redirect(`/tasks/${taskId}`);
});

export default taskRoutes;
