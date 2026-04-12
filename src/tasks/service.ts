import { eq, and, desc, inArray } from "drizzle-orm";
import type { Database } from "../db/client";
import { tasks, taskAssignees, taskOwners } from "../db/schema";

export function createTaskService(db: Database) {
  async function listActiveTasksForMember(userId: string) {
    const assignments = await db.query.taskAssignees.findMany({
      where: eq(taskAssignees.userId, userId),
      with: { task: true },
      orderBy: desc(taskAssignees.assignedAt),
    });
    return assignments.filter((a) => !a.task.archived).map((a) => ({ ...a.task, done: a.done }));
  }

  async function listArchivedTasksForMember(userId: string) {
    const assignments = await db.query.taskAssignees.findMany({
      where: eq(taskAssignees.userId, userId),
      with: { task: true },
      orderBy: desc(taskAssignees.assignedAt),
    });
    return assignments.filter((a) => a.task.archived).map((a) => ({ ...a.task, done: a.done }));
  }

  async function listOwnedActiveTasksForMember(userId: string) {
    const ownerships = await db.query.taskOwners.findMany({
      where: eq(taskOwners.userId, userId),
      with: { task: true },
    });
    return ownerships.filter((o) => !o.task.archived).map((o) => o.task);
  }

  async function listOwnedArchivedTasksForMember(userId: string) {
    const ownerships = await db.query.taskOwners.findMany({
      where: eq(taskOwners.userId, userId),
      with: { task: true },
    });
    return ownerships.filter((o) => o.task.archived).map((o) => o.task);
  }

  async function getTask(taskId: string) {
    return db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
    });
  }

  async function getTaskAssignees(taskId: string) {
    const assignments = await db.query.taskAssignees.findMany({
      where: eq(taskAssignees.taskId, taskId),
      with: { user: true },
    });
    return assignments.map((a) => a.user);
  }

  async function getTasksProgress(
    ownerId: string,
  ): Promise<Map<string, { total: number; done: number }>> {
    const ownedTaskIds = db
      .select({ taskId: taskOwners.taskId })
      .from(taskOwners)
      .where(eq(taskOwners.userId, ownerId));

    const activeTaskIds = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.archived, false));

    const assignments = await db
      .select({ taskId: taskAssignees.taskId, done: taskAssignees.done })
      .from(taskAssignees)
      .where(
        and(
          inArray(taskAssignees.taskId, ownedTaskIds),
          inArray(taskAssignees.taskId, activeTaskIds),
        ),
      );

    const map = new Map<string, { total: number; done: number }>();
    for (const a of assignments) {
      const entry = map.get(a.taskId) ?? { total: 0, done: 0 };
      entry.total++;
      if (a.done) entry.done++;
      map.set(a.taskId, entry);
    }
    return map;
  }

  async function listTaskAssigneesWithStatus(taskId: string) {
    const assignments = await db.query.taskAssignees.findMany({
      where: eq(taskAssignees.taskId, taskId),
      with: { user: true },
    });
    return assignments.map((a) => ({
      displayName: a.user.displayName,
      done: a.done,
    }));
  }

  async function isTaskOwner(taskId: string, userId: string) {
    const ownership = await db.query.taskOwners.findFirst({
      where: and(eq(taskOwners.taskId, taskId), eq(taskOwners.userId, userId)),
    });
    return !!ownership;
  }

  async function isTaskAssignee(taskId: string, userId: string) {
    const assignment = await db.query.taskAssignees.findFirst({
      where: and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, userId)),
    });
    return !!assignment;
  }

  async function listTaskOwners(taskId: string) {
    const owners = await db.query.taskOwners.findMany({
      where: eq(taskOwners.taskId, taskId),
      with: { user: true },
    });
    return owners.map((o) => o.user);
  }

  async function addTaskOwner(taskId: string, userId: string) {
    await db.insert(taskOwners).values({ taskId, userId }).onConflictDoNothing();
  }

  async function removeTaskOwner(taskId: string, userId: string) {
    // Count current owners
    const owners = await db.query.taskOwners.findMany({
      where: eq(taskOwners.taskId, taskId),
    });
    if (owners.length <= 1) {
      return { error: "cannot_remove_last_owner" as const };
    }

    await db
      .delete(taskOwners)
      .where(and(eq(taskOwners.taskId, taskId), eq(taskOwners.userId, userId)));
    return { error: null };
  }

  async function toggleAssigneeDone(taskId: string, userId: string) {
    const assignment = await db.query.taskAssignees.findFirst({
      where: and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, userId)),
    });
    if (!assignment) return null;

    const newDone = !assignment.done;
    await db
      .update(taskAssignees)
      .set({ done: newDone })
      .where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, userId)));

    const task = await getTask(taskId);
    if (!task) return null;
    return { ...task, done: newDone };
  }

  async function archiveTask(taskId: string) {
    const [updated] = await db
      .update(tasks)
      .set({ archived: true, updatedAt: new Date() })
      .where(eq(tasks.id, taskId))
      .returning();
    return updated;
  }

  async function unarchiveTask(taskId: string) {
    const [updated] = await db
      .update(tasks)
      .set({ archived: false, updatedAt: new Date() })
      .where(eq(tasks.id, taskId))
      .returning();
    return updated;
  }

  async function updateTask(
    taskId: string,
    data: {
      title?: string;
      description?: string | null;
      deadline?: Date | null;
    },
  ) {
    const [updated] = await db
      .update(tasks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tasks.id, taskId))
      .returning();
    return updated;
  }

  async function findTaskBySlackMessage(channelId: string, messageTs: string) {
    return db.query.tasks.findFirst({
      where: and(eq(tasks.slackChannelId, channelId), eq(tasks.slackMessageTs, messageTs)),
    });
  }

  async function createTask(data: {
    title: string;
    description?: string;
    deadline?: Date | null;
    slackMessageTs?: string;
    slackChannelId?: string;
    slackPermalink?: string;
    createdById: string;
    assigneeIds: string[];
  }) {
    const { assigneeIds, ...taskData } = data;

    const [task] = await db.insert(tasks).values(taskData).returning();

    // Creator becomes the default owner
    await db.insert(taskOwners).values({
      taskId: task.id,
      userId: data.createdById,
    });

    if (assigneeIds.length > 0) {
      await db.insert(taskAssignees).values(
        assigneeIds.map((userId) => ({
          taskId: task.id,
          userId,
        })),
      );
    }

    return task;
  }

  return {
    listActiveTasksForMember,
    listArchivedTasksForMember,
    listOwnedActiveTasksForMember,
    listOwnedArchivedTasksForMember,
    getTask,
    getTaskAssignees,
    getTasksProgress,
    listTaskAssigneesWithStatus,
    isTaskOwner,
    isTaskAssignee,
    listTaskOwners,
    addTaskOwner,
    removeTaskOwner,
    toggleAssigneeDone,
    archiveTask,
    unarchiveTask,
    updateTask,
    findTaskBySlackMessage,
    createTask,
  };
}

export type TaskService = ReturnType<typeof createTaskService>;
