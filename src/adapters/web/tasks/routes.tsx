import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";
import type { TaskService } from "../../../application/tasks/service";
import type { UserService } from "../../../application/users/service";
import { HomePage, HomeContentPartial } from "../../../views/pages/home";
import type { FilterCounts } from "../../../views/pages/home";
import { ArchivedPage } from "../../../views/pages/archived.tsx";
import {
  TaskEditPage,
  OwnersPartial,
  OwnerSearchResults,
} from "../../../views/pages/task-detail.tsx";
import { TaskStatusPage } from "../../../views/pages/task-status.tsx";
import { TaskCard } from "../../../views/components/task-card.tsx";

export interface TaskRoutesDeps {
  authMiddleware: MiddlewareHandler;
  taskService: TaskService;
  userService: UserService;
  buildMrkdwnLabels: (
    texts: (string | null | undefined)[],
  ) => Promise<import("../../slack/mrkdwn").MrkdwnOptions>;
  devMode: boolean;
}

export function createTaskRoutes(deps: TaskRoutesDeps) {
  const { authMiddleware, taskService, userService, buildMrkdwnLabels, devMode } = deps;
  const taskRoutes = new Hono();

  taskRoutes.use("*", authMiddleware);

  function getLocale(c: { req: { raw: Request } }): string {
    const cookie = getCookie(c as any, "locale");
    return cookie === "ja" ? "ja" : "en";
  }

  function getTheme(c: { req: { raw: Request } }): string {
    const cookie = getCookie(c as any, "theme");
    return cookie === "light" ? "light" : "dark";
  }

  async function buildHomeData(userId: string, filter: string, isAdmin: boolean) {
    const allAssignedTasks = await taskService.listActiveTasksForMember(userId);
    const allOwnedTasks = await taskService.listOwnedActiveTasksForMember(userId);

    const now = new Date();
    const counts: FilterCounts = {
      all: allAssignedTasks.length,
      open: allAssignedTasks.filter((t) => !t.done).length,
      done: allAssignedTasks.filter((t) => t.done).length,
    };
    const overdueCount = allAssignedTasks.filter(
      (t) => !t.done && t.deadline && new Date(t.deadline) < now,
    ).length;
    const ownedOverdueCount = allOwnedTasks.filter(
      (t) => t.deadline && new Date(t.deadline) < now,
    ).length;

    let filteredAssigned = allAssignedTasks;
    if (filter === "open") {
      filteredAssigned = allAssignedTasks.filter((t) => !t.done);
    } else if (filter === "done") {
      filteredAssigned = allAssignedTasks.filter((t) => t.done);
    }

    const assignedTasks = await Promise.all(
      filteredAssigned.map(async (t) => ({
        ...t,
        isOwner: isAdmin || (await taskService.isTaskOwner(t.id, userId)),
        isAssignee: true,
      })),
    );

    const ownedTasks = allOwnedTasks.map((t) => ({
      ...t,
      done: false,
      isOwner: true,
      isAssignee: false,
    }));

    const ownedProgressMap = await taskService.getTasksProgress(userId);

    return {
      assignedTasks,
      ownedTasks,
      counts,
      overdueCount,
      ownedOverdueCount,
      ownedProgressMap,
    };
  }

  // Redirect root to the task list
  taskRoutes.get("/", (c) => c.redirect("/tasks"));

  // Task list - active tasks
  taskRoutes.get("/tasks", async (c) => {
    const { sub: userId, name: displayName } = c.get("jwtPayload");
    const isAdmin = c.get("isAdmin");
    const avatarUrl = c.get("avatarUrl");
    const locale = getLocale(c);
    const theme = getTheme(c);
    const filter = c.req.query("filter") ?? "all";
    const view = c.req.query("view") === "owned" ? "owned" : "assigned";

    const { assignedTasks, ownedTasks, counts, overdueCount, ownedOverdueCount, ownedProgressMap } =
      await buildHomeData(userId, filter, isAdmin);
    const mrkdwnLabels = await buildMrkdwnLabels(
      [...assignedTasks, ...ownedTasks].map((t) => t.description),
    );

    // htmx partial request — return summary + tabs + task list
    if (c.req.header("HX-Request") && !c.req.header("HX-Boosted")) {
      return c.html(
        <HomeContentPartial
          assignedTasks={assignedTasks}
          ownedTasks={ownedTasks}
          locale={locale}
          activeFilter={filter}
          activeView={view}
          counts={counts}
          overdueCount={overdueCount}
          ownedOverdueCount={ownedOverdueCount}
          mrkdwnLabels={mrkdwnLabels}
          ownedProgressMap={ownedProgressMap}
        />,
      );
    }

    return c.html(
      <HomePage
        assignedTasks={assignedTasks}
        ownedTasks={ownedTasks}
        displayName={displayName}
        avatarUrl={avatarUrl}
        locale={locale}
        theme={theme}
        activeFilter={filter}
        activeView={view}
        counts={counts}
        overdueCount={overdueCount}
        ownedOverdueCount={ownedOverdueCount}
        mrkdwnLabels={mrkdwnLabels}
        ownedProgressMap={ownedProgressMap}
        isAdmin={isAdmin}
        devMode={devMode}
      />,
    );
  });

  // Archived tasks
  taskRoutes.get("/tasks/archived", async (c) => {
    const { sub: userId, name: displayName } = c.get("jwtPayload");
    const isAdmin = c.get("isAdmin");
    const avatarUrl = c.get("avatarUrl");
    const locale = getLocale(c);
    const theme = getTheme(c);
    const view = c.req.query("view") === "owned" ? "owned" : "assigned";

    const assignedArchived = await taskService.listArchivedTasksForMember(userId);
    const ownedArchived = await taskService.listOwnedArchivedTasksForMember(userId);

    const tasksWithFlags =
      view === "owned"
        ? ownedArchived.map((t) => ({
            ...t,
            done: false,
            isOwner: true,
            isAssignee: false,
          }))
        : await Promise.all(
            assignedArchived.map(async (t) => ({
              ...t,
              isOwner: isAdmin || (await taskService.isTaskOwner(t.id, userId)),
              isAssignee: true,
            })),
          );

    const mrkdwnLabels = await buildMrkdwnLabels(tasksWithFlags.map((t) => t.description));
    return c.html(
      <ArchivedPage
        tasks={tasksWithFlags}
        displayName={displayName}
        avatarUrl={avatarUrl}
        locale={locale}
        theme={theme}
        activeView={view}
        assignedCount={assignedArchived.length}
        ownedCount={ownedArchived.length}
        mrkdwnLabels={mrkdwnLabels}
        isAdmin={isAdmin}
        devMode={devMode}
      />,
    );
  });

  // Task status — assignee completion (owner or admin)
  taskRoutes.get("/tasks/:id/status", async (c) => {
    const taskId = c.req.param("id");
    const { sub: userId, name: displayName } = c.get("jwtPayload");
    const isAdmin = c.get("isAdmin");
    const avatarUrl = c.get("avatarUrl");
    const locale = getLocale(c);
    const theme = getTheme(c);

    const task = await taskService.getTask(taskId);
    if (!task) return c.notFound();

    const owner = await taskService.isTaskOwner(taskId, userId);
    if (!owner && !isAdmin) return c.redirect("/tasks");

    const assignees = await taskService.listTaskAssigneesWithStatus(taskId);

    return c.html(
      <TaskStatusPage
        task={task}
        assignees={assignees}
        displayName={displayName}
        avatarUrl={avatarUrl}
        locale={locale}
        theme={theme}
        isAdmin={isAdmin}
        devMode={devMode}
      />,
    );
  });

  // Task edit form (owner or admin)
  taskRoutes.get("/tasks/:id/edit", async (c) => {
    const taskId = c.req.param("id");
    const { sub: userId, name: displayName } = c.get("jwtPayload");
    const isAdmin = c.get("isAdmin");
    const avatarUrl = c.get("avatarUrl");
    const locale = getLocale(c);
    const theme = getTheme(c);

    const task = await taskService.getTask(taskId);
    if (!task) return c.notFound();

    const owner = await taskService.isTaskOwner(taskId, userId);
    if (!owner && !isAdmin) return c.redirect("/tasks");

    const owners = await taskService.listTaskOwners(taskId);

    return c.html(
      <TaskEditPage
        task={task}
        owners={owners}
        displayName={displayName}
        avatarUrl={avatarUrl}
        locale={locale}
        theme={theme}
        isAdmin={isAdmin}
        devMode={devMode}
      />,
    );
  });

  // Update task (owner or admin)
  taskRoutes.post("/tasks/:id", async (c) => {
    const taskId = c.req.param("id");
    const { sub: userId } = c.get("jwtPayload");
    const isAdmin = c.get("isAdmin");

    const owner = await taskService.isTaskOwner(taskId, userId);
    if (!owner && !isAdmin) return c.text("Forbidden", 403);

    const body = await c.req.parseBody();
    await taskService.updateTask(taskId, {
      title: body.title as string,
      description: (body.description as string) || null,
      deadline: body.deadline ? new Date(body.deadline as string) : null,
    });

    return c.redirect("/tasks");
  });

  // Toggle assignee done status (assignee only)
  taskRoutes.patch("/tasks/:id/done", async (c) => {
    const taskId = c.req.param("id");
    const { sub: userId } = c.get("jwtPayload");
    const locale = getLocale(c);

    const assignee = await taskService.isTaskAssignee(taskId, userId);
    if (!assignee) return c.text("Forbidden", 403);

    const task = await taskService.toggleAssigneeDone(taskId, userId);
    if (!task) return c.notFound();

    const isAdmin = c.get("isAdmin");
    const owner = await taskService.isTaskOwner(taskId, userId);
    const mrkdwnLabels = await buildMrkdwnLabels([task.description]);
    return c.html(
      <TaskCard
        task={task}
        done={task.done}
        isOwner={owner || isAdmin}
        isAssignee
        showActions
        locale={locale}
        mrkdwnLabels={mrkdwnLabels}
      />,
    );
  });

  // Archive task (owner or admin)
  taskRoutes.patch("/tasks/:id/archive", async (c) => {
    const taskId = c.req.param("id");
    const { sub: userId } = c.get("jwtPayload");
    const isAdmin = c.get("isAdmin");

    const owner = await taskService.isTaskOwner(taskId, userId);
    if (!owner && !isAdmin) return c.text("Forbidden", 403);

    await taskService.archiveTask(taskId);

    // Remove the card from the list
    return c.body(null, 200);
  });

  // Unarchive task (owner or admin)
  taskRoutes.patch("/tasks/:id/unarchive", async (c) => {
    const taskId = c.req.param("id");
    const { sub: userId } = c.get("jwtPayload");
    const isAdmin = c.get("isAdmin");

    const owner = await taskService.isTaskOwner(taskId, userId);
    if (!owner && !isAdmin) return c.text("Forbidden", 403);

    await taskService.unarchiveTask(taskId);

    // Remove the card from the archived list
    return c.body(null, 200);
  });

  // Owner autocomplete search (owner or admin)
  taskRoutes.get("/tasks/:id/owners/search", async (c) => {
    const taskId = c.req.param("id");
    const { sub: userId } = c.get("jwtPayload");
    const isAdmin = c.get("isAdmin");
    const locale = getLocale(c);

    const owner = await taskService.isTaskOwner(taskId, userId);
    if (!owner && !isAdmin) return c.text("Forbidden", 403);

    const q = c.req.query("q")?.trim() ?? "";
    const currentOwners = await taskService.listTaskOwners(taskId);
    const results = await userService.searchUsersByName(q, {
      excludeIds: currentOwners.map((o) => o.id),
    });

    return c.html(<OwnerSearchResults taskId={taskId} results={results} locale={locale} />);
  });

  // Add task owner (owner or admin)
  taskRoutes.post("/tasks/:id/owners", async (c) => {
    const taskId = c.req.param("id");
    const { sub: userId } = c.get("jwtPayload");
    const isAdmin = c.get("isAdmin");
    const locale = getLocale(c);

    const owner = await taskService.isTaskOwner(taskId, userId);
    if (!owner && !isAdmin) return c.text("Forbidden", 403);

    const body = await c.req.parseBody();
    // Prefer user_id (from the autocomplete results); fall back to
    // slack_user_id for any older clients still posting raw Slack IDs.
    const newOwnerUserId = (body.user_id as string)?.trim();
    const slackUserId = (body.slack_user_id as string)?.trim();

    let user = null;
    if (newOwnerUserId) {
      user = await userService.findUserById(newOwnerUserId);
    } else if (slackUserId) {
      user = await userService.findUserBySlackUserId(slackUserId);
    } else {
      return c.text("Bad Request", 400);
    }
    if (!user) return c.text("User not found", 404);

    await taskService.addTaskOwner(taskId, user.id);

    const task = await taskService.getTask(taskId);
    if (!task) return c.notFound();
    const owners = await taskService.listTaskOwners(taskId);

    return c.html(<OwnersPartial task={task} owners={owners} locale={locale} />);
  });

  // Remove task owner (owner or admin)
  taskRoutes.delete("/tasks/:id/owners/:userId", async (c) => {
    const taskId = c.req.param("id");
    const targetUserId = c.req.param("userId");
    const { sub: userId } = c.get("jwtPayload");
    const isAdmin = c.get("isAdmin");
    const locale = getLocale(c);

    const owner = await taskService.isTaskOwner(taskId, userId);
    if (!owner && !isAdmin) return c.text("Forbidden", 403);

    await taskService.removeTaskOwner(taskId, targetUserId);

    const task = await taskService.getTask(taskId);
    if (!task) return c.notFound();
    const owners = await taskService.listTaskOwners(taskId);

    return c.html(<OwnersPartial task={task} owners={owners} locale={locale} />);
  });

  return taskRoutes;
}
