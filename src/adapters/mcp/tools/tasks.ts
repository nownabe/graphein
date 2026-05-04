import { z } from "zod";
import {
  type SQL,
  and,
  eq,
  lt,
  gt,
  or,
  desc,
  sql,
  inArray,
  count as drizzleCount,
} from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "../../../db/client";
import { tasks, taskAssignees, taskOwners, users } from "../../../db/schema";
import type { TaskService } from "../../../tasks/service";
import type { McpContext } from "../types";

import {
  encodePageToken,
  decodePageToken,
  isValidIso8601,
  validateTimestampCursor,
  filterFingerprint,
  UUID_REGEX,
} from "../../../pagination";
import { errorResult, jsonResult } from "./helpers";

async function getProgressForTasks(
  db: Database,
  taskIds: string[],
): Promise<Map<string, { total: number; done: number }>> {
  if (taskIds.length === 0) return new Map();

  const rows = await db
    .select({
      taskId: taskAssignees.taskId,
      total: drizzleCount(),
      done: sql<number>`count(*) filter (where ${taskAssignees.done} = true)`.as("done"),
    })
    .from(taskAssignees)
    .where(inArray(taskAssignees.taskId, taskIds))
    .groupBy(taskAssignees.taskId);

  const map = new Map<string, { total: number; done: number }>();
  for (const row of rows) {
    map.set(row.taskId, { total: row.total, done: Number(row.done) });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export interface TaskToolsDeps {
  db: Database;
  taskService: TaskService;
  getMcpContext: () => McpContext;
}

export function registerTaskTools(server: McpServer, deps: TaskToolsDeps): void {
  const { db, taskService, getMcpContext } = deps;

  // -------------------------------------------------------------------------
  // list_assigned_tasks
  // -------------------------------------------------------------------------

  server.registerTool(
    "list_assigned_tasks",
    {
      description: "List tasks assigned to the authenticated user.",
      inputSchema: {
        status: z.enum(["active", "archived"]).default("active").describe("Task archive status."),
        done: z.boolean().optional().describe("Filter by completion status."),
        deadlineBefore: z
          .string()
          .optional()
          .describe("Tasks with deadline before this ISO 8601 datetime."),
        deadlineAfter: z
          .string()
          .optional()
          .describe("Tasks with deadline after this ISO 8601 datetime."),
        pageSize: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(50)
          .describe("Max results (default 50, max 100)."),
        pageToken: z.string().optional().describe("Cursor for next page."),
      },
    },
    async ({ status, done, deadlineBefore, deadlineAfter, pageSize, pageToken }) => {
      const { user } = getMcpContext();
      const userId = user.id;

      // Validate datetime filters
      if (deadlineBefore && !isValidIso8601(deadlineBefore)) {
        return errorResult("validation_error", "deadlineBefore must be a valid ISO 8601 datetime.");
      }
      if (deadlineAfter && !isValidIso8601(deadlineAfter)) {
        return errorResult("validation_error", "deadlineAfter must be a valid ISO 8601 datetime.");
      }

      const isArchived = status === "archived";
      const fp = filterFingerprint({
        status,
        done: done !== undefined ? String(done) : undefined,
        deadlineBefore,
        deadlineAfter,
      });

      let cursorCondition: SQL | undefined;
      if (pageToken) {
        const cursor = decodePageToken(pageToken);
        if (!cursor || cursor.fp !== fp || !cursor.id || !validateTimestampCursor(cursor)) {
          return errorResult("validation_error", "Invalid or mismatched pageToken.");
        }
        const cursorTime = new Date(cursor.v);
        cursorCondition = or(
          lt(taskAssignees.assignedAt, cursorTime),
          and(eq(taskAssignees.assignedAt, cursorTime), lt(tasks.id, cursor.id)),
        );
      }

      const filterConditions: SQL[] = [
        eq(taskAssignees.userId, userId),
        eq(tasks.archived, isArchived),
      ];

      if (done !== undefined) {
        filterConditions.push(eq(taskAssignees.done, done));
      }
      if (deadlineBefore) {
        filterConditions.push(lt(tasks.deadline, new Date(deadlineBefore)));
      }
      if (deadlineAfter) {
        filterConditions.push(gt(tasks.deadline, new Date(deadlineAfter)));
      }

      const [{ total }] = await db
        .select({ total: drizzleCount() })
        .from(taskAssignees)
        .innerJoin(tasks, eq(taskAssignees.taskId, tasks.id))
        .where(and(...filterConditions));

      const allConditions = cursorCondition
        ? [...filterConditions, cursorCondition]
        : filterConditions;

      const rows = await db
        .select({
          taskId: tasks.id,
          title: tasks.title,
          description: tasks.description,
          archived: tasks.archived,
          done: taskAssignees.done,
          deadline: tasks.deadline,
          slackPermalink: tasks.slackPermalink,
          createdById: tasks.createdById,
          createdAt: tasks.createdAt,
          updatedAt: tasks.updatedAt,
          assignedAt: taskAssignees.assignedAt,
        })
        .from(taskAssignees)
        .innerJoin(tasks, eq(taskAssignees.taskId, tasks.id))
        .where(and(...allConditions))
        .orderBy(desc(taskAssignees.assignedAt), desc(tasks.id))
        .limit(pageSize + 1);

      const hasNext = rows.length > pageSize;
      const page = hasNext ? rows.slice(0, pageSize) : rows;

      const creatorIds = [...new Set(page.map((r) => r.createdById))];
      const creatorRows =
        creatorIds.length > 0
          ? await db
              .select({ id: users.id, displayName: users.displayName })
              .from(users)
              .where(inArray(users.id, creatorIds))
          : [];
      const creatorMap = new Map(creatorRows.map((u) => [u.id, u]));

      const lastRow = page[page.length - 1];
      const nextPageToken =
        hasNext && lastRow
          ? encodePageToken({ fp, v: lastRow.assignedAt.toISOString(), id: lastRow.taskId })
          : "";

      return jsonResult({
        tasks: page.map((r) => ({
          id: r.taskId,
          title: r.title,
          body: r.description,
          archived: r.archived,
          done: r.done,
          deadline: r.deadline?.toISOString() ?? null,
          slackPermalink: r.slackPermalink,
          createdBy: creatorMap.get(r.createdById) ?? { id: r.createdById, displayName: "Unknown" },
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
        totalSize: total,
        nextPageToken,
      });
    },
  );

  // -------------------------------------------------------------------------
  // list_owned_tasks
  // -------------------------------------------------------------------------

  server.registerTool(
    "list_owned_tasks",
    {
      description: "List tasks owned by the authenticated user (or all tasks for admin).",
      inputSchema: {
        status: z.enum(["active", "archived"]).default("active").describe("Task archive status."),
        deadlineBefore: z
          .string()
          .optional()
          .describe("Tasks with deadline before this ISO 8601 datetime."),
        deadlineAfter: z
          .string()
          .optional()
          .describe("Tasks with deadline after this ISO 8601 datetime."),
        pageSize: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(50)
          .describe("Max results (default 50, max 100)."),
        pageToken: z.string().optional().describe("Cursor for next page."),
      },
    },
    async ({ status, deadlineBefore, deadlineAfter, pageSize, pageToken }) => {
      const { user, role } = getMcpContext();
      const isAdmin = role === "admin";

      if (deadlineBefore && !isValidIso8601(deadlineBefore)) {
        return errorResult("validation_error", "deadlineBefore must be a valid ISO 8601 datetime.");
      }
      if (deadlineAfter && !isValidIso8601(deadlineAfter)) {
        return errorResult("validation_error", "deadlineAfter must be a valid ISO 8601 datetime.");
      }

      const isArchived = status === "archived";
      const fp = filterFingerprint({ status, deadlineBefore, deadlineAfter });

      let cursorCondition: SQL | undefined;
      if (pageToken) {
        const cursor = decodePageToken(pageToken);
        if (!cursor || cursor.fp !== fp || !cursor.id || !validateTimestampCursor(cursor)) {
          return errorResult("validation_error", "Invalid or mismatched pageToken.");
        }
        const cursorTime = new Date(cursor.v);
        cursorCondition = or(
          lt(tasks.createdAt, cursorTime),
          and(eq(tasks.createdAt, cursorTime), lt(tasks.id, cursor.id)),
        );
      }

      const filterConditions: SQL[] = [eq(tasks.archived, isArchived)];
      if (deadlineBefore) {
        filterConditions.push(lt(tasks.deadline, new Date(deadlineBefore)));
      }
      if (deadlineAfter) {
        filterConditions.push(gt(tasks.deadline, new Date(deadlineAfter)));
      }

      if (isAdmin) {
        const [{ total }] = await db
          .select({ total: drizzleCount() })
          .from(tasks)
          .where(and(...filterConditions));

        const allConditions = cursorCondition
          ? [...filterConditions, cursorCondition]
          : filterConditions;

        const rows = await db
          .select()
          .from(tasks)
          .where(and(...allConditions))
          .orderBy(desc(tasks.createdAt), desc(tasks.id))
          .limit(pageSize + 1);

        const hasNext = rows.length > pageSize;
        const page = hasNext ? rows.slice(0, pageSize) : rows;

        const taskIds = page.map((t) => t.id);
        const progressMap = await getProgressForTasks(db, taskIds);

        const creatorIds = [...new Set(page.map((t) => t.createdById))];
        const creatorRows =
          creatorIds.length > 0
            ? await db
                .select({ id: users.id, displayName: users.displayName })
                .from(users)
                .where(inArray(users.id, creatorIds))
            : [];
        const creatorMap = new Map(creatorRows.map((u) => [u.id, u]));

        const lastRow = page[page.length - 1];
        const nextPageToken =
          hasNext && lastRow
            ? encodePageToken({ fp, v: lastRow.createdAt.toISOString(), id: lastRow.id })
            : "";

        return jsonResult({
          tasks: page.map((t) => ({
            id: t.id,
            title: t.title,
            body: t.description,
            archived: t.archived,
            deadline: t.deadline?.toISOString() ?? null,
            slackPermalink: t.slackPermalink,
            createdBy: creatorMap.get(t.createdById) ?? {
              id: t.createdById,
              displayName: "Unknown",
            },
            progress: progressMap.get(t.id) ?? { total: 0, done: 0 },
            createdAt: t.createdAt.toISOString(),
            updatedAt: t.updatedAt.toISOString(),
          })),
          totalSize: total,
          nextPageToken,
        });
      }

      // Non-admin: tasks where user is an owner
      const ownerFilter: SQL[] = [...filterConditions, eq(taskOwners.userId, user.id)];
      const [{ total }] = await db
        .select({ total: drizzleCount() })
        .from(tasks)
        .innerJoin(taskOwners, eq(tasks.id, taskOwners.taskId))
        .where(and(...ownerFilter));

      const allConditions = cursorCondition ? [...ownerFilter, cursorCondition] : ownerFilter;

      const rows = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          description: tasks.description,
          archived: tasks.archived,
          deadline: tasks.deadline,
          slackPermalink: tasks.slackPermalink,
          createdById: tasks.createdById,
          createdAt: tasks.createdAt,
          updatedAt: tasks.updatedAt,
        })
        .from(tasks)
        .innerJoin(taskOwners, eq(tasks.id, taskOwners.taskId))
        .where(and(...allConditions))
        .orderBy(desc(tasks.createdAt), desc(tasks.id))
        .limit(pageSize + 1);

      const hasNext = rows.length > pageSize;
      const page = hasNext ? rows.slice(0, pageSize) : rows;

      const taskIds = page.map((t) => t.id);
      const progressMap = await getProgressForTasks(db, taskIds);

      const creatorIds = [...new Set(page.map((t) => t.createdById))];
      const creatorRows =
        creatorIds.length > 0
          ? await db
              .select({ id: users.id, displayName: users.displayName })
              .from(users)
              .where(inArray(users.id, creatorIds))
          : [];
      const creatorMap = new Map(creatorRows.map((u) => [u.id, u]));

      const lastRow = page[page.length - 1];
      const nextPageToken =
        hasNext && lastRow
          ? encodePageToken({ fp, v: lastRow.createdAt.toISOString(), id: lastRow.id })
          : "";

      return jsonResult({
        tasks: page.map((t) => ({
          id: t.id,
          title: t.title,
          body: t.description,
          archived: t.archived,
          deadline: t.deadline?.toISOString() ?? null,
          slackPermalink: t.slackPermalink,
          createdBy: creatorMap.get(t.createdById) ?? {
            id: t.createdById,
            displayName: "Unknown",
          },
          progress: progressMap.get(t.id) ?? { total: 0, done: 0 },
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        })),
        totalSize: total,
        nextPageToken,
      });
    },
  );

  // -------------------------------------------------------------------------
  // list_task_assignees
  // -------------------------------------------------------------------------

  server.registerTool(
    "list_task_assignees",
    {
      description: "List assignees with completion status for a specific owned task.",
      inputSchema: {
        taskId: z.string().uuid().describe("The task ID."),
        done: z.boolean().optional().describe("Filter by completion status."),
        pageSize: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(50)
          .describe("Max results (default 50, max 100)."),
        pageToken: z.string().optional().describe("Cursor for next page."),
      },
    },
    async ({ taskId, done, pageSize, pageToken }) => {
      const { user, role } = getMcpContext();
      const isAdmin = role === "admin";

      const task = await taskService.getTask(taskId);
      if (!task) {
        return errorResult("not_found", "Task not found.");
      }

      if (!isAdmin) {
        const isOwner = await taskService.isTaskOwner(taskId, user.id);
        if (!isOwner) {
          return errorResult("forbidden", "You are not an owner of this task.");
        }
      }

      const fp = filterFingerprint({ done: done !== undefined ? String(done) : undefined });

      let cursorCondition: SQL | undefined;
      if (pageToken) {
        const cursor = decodePageToken(pageToken);
        if (!cursor || cursor.fp !== fp || !UUID_REGEX.test(cursor.v)) {
          return errorResult("validation_error", "Invalid or mismatched pageToken.");
        }
        cursorCondition = lt(taskAssignees.userId, cursor.v);
      }

      const filterConditions: SQL[] = [eq(taskAssignees.taskId, taskId)];
      if (done !== undefined) {
        filterConditions.push(eq(taskAssignees.done, done));
      }

      const [{ total }] = await db
        .select({ total: drizzleCount() })
        .from(taskAssignees)
        .where(and(...filterConditions));

      const allConditions = cursorCondition
        ? [...filterConditions, cursorCondition]
        : filterConditions;

      const rows = await db
        .select({
          userId: taskAssignees.userId,
          done: taskAssignees.done,
          displayName: users.displayName,
        })
        .from(taskAssignees)
        .innerJoin(users, eq(taskAssignees.userId, users.id))
        .where(and(...allConditions))
        .orderBy(desc(taskAssignees.userId))
        .limit(pageSize + 1);

      const hasNext = rows.length > pageSize;
      const page = hasNext ? rows.slice(0, pageSize) : rows;

      const lastRow = page[page.length - 1];
      const nextPageToken = hasNext && lastRow ? encodePageToken({ fp, v: lastRow.userId }) : "";

      return jsonResult({
        taskId,
        assignees: page.map((r) => ({
          userId: r.userId,
          displayName: r.displayName,
          done: r.done,
        })),
        totalSize: total,
        nextPageToken,
      });
    },
  );

  // -------------------------------------------------------------------------
  // archive_task
  // -------------------------------------------------------------------------

  server.registerTool(
    "archive_task",
    {
      description: "Archive a task. Idempotent.",
      inputSchema: {
        taskId: z.string().uuid().describe("The task ID."),
      },
    },
    async ({ taskId }) => {
      const { user, role } = getMcpContext();
      const isAdmin = role === "admin";

      const task = await taskService.getTask(taskId);
      if (!task) {
        return errorResult("not_found", "Task not found.");
      }

      if (!isAdmin) {
        const isOwner = await taskService.isTaskOwner(taskId, user.id);
        if (!isOwner) {
          return errorResult("forbidden", "You are not an owner of this task.");
        }
      }

      if (task.archived) {
        return jsonResult({
          id: task.id,
          title: task.title,
          archived: task.archived,
          updatedAt: task.updatedAt.toISOString(),
        });
      }

      const updated = await taskService.archiveTask(taskId);
      return jsonResult({
        id: updated.id,
        title: updated.title,
        archived: updated.archived,
        updatedAt: updated.updatedAt.toISOString(),
      });
    },
  );

  // -------------------------------------------------------------------------
  // unarchive_task
  // -------------------------------------------------------------------------

  server.registerTool(
    "unarchive_task",
    {
      description: "Unarchive a task. Idempotent.",
      inputSchema: {
        taskId: z.string().uuid().describe("The task ID."),
      },
    },
    async ({ taskId }) => {
      const { user, role } = getMcpContext();
      const isAdmin = role === "admin";

      const task = await taskService.getTask(taskId);
      if (!task) {
        return errorResult("not_found", "Task not found.");
      }

      if (!isAdmin) {
        const isOwner = await taskService.isTaskOwner(taskId, user.id);
        if (!isOwner) {
          return errorResult("forbidden", "You are not an owner of this task.");
        }
      }

      if (!task.archived) {
        return jsonResult({
          id: task.id,
          title: task.title,
          archived: task.archived,
          updatedAt: task.updatedAt.toISOString(),
        });
      }

      const updated = await taskService.unarchiveTask(taskId);
      return jsonResult({
        id: updated.id,
        title: updated.title,
        archived: updated.archived,
        updatedAt: updated.updatedAt.toISOString(),
      });
    },
  );
}
