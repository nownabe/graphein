import { eq, ne, desc } from "drizzle-orm";
import { db } from "../db/client";
import { tasks, taskAssignees, members } from "../db/schema";

export async function listActiveTasksForMember(memberId: string) {
  const assignments = await db.query.taskAssignees.findMany({
    where: eq(taskAssignees.memberId, memberId),
    with: { task: true },
    orderBy: desc(taskAssignees.assignedAt),
  });
  return assignments.map((a) => a.task).filter((t) => t.status !== "archived");
}

export async function listArchivedTasksForMember(memberId: string) {
  const assignments = await db.query.taskAssignees.findMany({
    where: eq(taskAssignees.memberId, memberId),
    with: { task: true },
    orderBy: desc(taskAssignees.assignedAt),
  });
  return assignments.map((a) => a.task).filter((t) => t.status === "archived");
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

export async function updateTask(
  taskId: string,
  data: {
    title?: string;
    description?: string | null;
    deadline?: Date | null;
    status?: "open" | "done" | "archived";
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
