import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/client";
import { tasks, taskAssignees, members } from "../db/schema";

export async function listActiveTasksForMember(memberId: string) {
  const assignments = await db.query.taskAssignees.findMany({
    where: eq(taskAssignees.memberId, memberId),
    with: { task: true },
    orderBy: desc(taskAssignees.assignedAt),
  });
  return assignments
    .filter((a) => !a.task.archived)
    .map((a) => ({ ...a.task, done: a.done }));
}

export async function listArchivedTasksForMember(memberId: string) {
  const assignments = await db.query.taskAssignees.findMany({
    where: eq(taskAssignees.memberId, memberId),
    with: { task: true },
    orderBy: desc(taskAssignees.assignedAt),
  });
  return assignments
    .filter((a) => a.task.archived)
    .map((a) => ({ ...a.task, done: a.done }));
}

export async function getTask(taskId: string) {
  return db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });
}

export async function getTaskAssignees(taskId: string) {
  const assignments = await db.query.taskAssignees.findMany({
    where: eq(taskAssignees.taskId, taskId),
    with: { member: true },
  });
  return assignments.map((a) => a.member);
}

export async function isTaskOwner(taskId: string, memberId: string) {
  const assignment = await db.query.taskAssignees.findFirst({
    where: (ta, { and, eq: e }) =>
      and(e(ta.taskId, taskId), e(ta.memberId, memberId)),
  });
  return !!assignment;
}

export async function toggleAssigneeDone(taskId: string, memberId: string) {
  const assignment = await db.query.taskAssignees.findFirst({
    where: and(
      eq(taskAssignees.taskId, taskId),
      eq(taskAssignees.memberId, memberId),
    ),
  });
  if (!assignment) return null;

  const newDone = !assignment.done;
  await db
    .update(taskAssignees)
    .set({ done: newDone })
    .where(
      and(
        eq(taskAssignees.taskId, taskId),
        eq(taskAssignees.memberId, memberId),
      ),
    );

  const task = await getTask(taskId);
  if (!task) return null;
  return { ...task, done: newDone };
}

export async function archiveTask(taskId: string) {
  const [updated] = await db
    .update(tasks)
    .set({ archived: true, updatedAt: new Date() })
    .where(eq(tasks.id, taskId))
    .returning();
  return updated;
}

export async function updateTask(
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

export async function createTask(data: {
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

  if (assigneeIds.length > 0) {
    await db.insert(taskAssignees).values(
      assigneeIds.map((memberId) => ({
        taskId: task.id,
        memberId,
      })),
    );
  }

  return task;
}
