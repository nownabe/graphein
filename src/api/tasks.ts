import { z } from "@hono/zod-openapi";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
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
import type { Database } from "../db/client";
import { tasks, taskAssignees, taskOwners, users } from "../db/schema";
import type { TaskService } from "../tasks/service";
import {
  CreatedBySchema,
  ErrorResponseSchema,
  UnauthorizedResponse,
  RateLimitedResponse,
} from "./schemas";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface PageCursor {
  /** Filter fingerprint to detect changed filters between pages. */
  fp: string;
  /** Cursor value — ISO 8601 timestamp for task lists, UUID for assignee lists. */
  v: string;
  /** Secondary cursor (task ID) for tie-breaking when primary is a timestamp. */
  id?: string;
}

function encodePageToken(cursor: PageCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodePageToken(token: string): PageCursor | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.fp !== "string" || typeof parsed.v !== "string") return null;
    if (parsed.id !== undefined && typeof parsed.id !== "string") return null;
    return parsed as PageCursor;
  } catch {
    return null;
  }
}

/** Validate that cursor.v is a valid ISO 8601 timestamp and cursor.id is a valid UUID. */
function validateTimestampCursor(cursor: PageCursor): boolean {
  if (!isValidIso8601(cursor.v)) return false;
  if (cursor.id !== undefined && !UUID_REGEX.test(cursor.id)) return false;
  return true;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Compute a stable fingerprint of the filter parameters (excluding pagination). */
function filterFingerprint(params: Record<string, string | undefined>): string {
  const sorted = Object.entries(params)
    .filter(([_, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return sorted;
}

const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function isValidIso8601(value: string): boolean {
  if (!ISO_8601_REGEX.test(value)) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

const iso8601String = z
  .string()
  .refine(isValidIso8601, { message: "Must be a valid ISO 8601 datetime string" });

// ---------------------------------------------------------------------------
// Zod schemas — request / response
// ---------------------------------------------------------------------------

// -- GET /tasks --

const ListAssignedTasksQuerySchema = z
  .object({
    status: z.enum(["active", "archived"]).default("active").openapi({
      description: "Task archive status.",
      example: "active",
    }),
    done: z.enum(["true", "false"]).optional().openapi({
      description: "Filter by the authenticated user's completion status.",
      example: "false",
    }),
    deadlineBefore: iso8601String.optional().openapi({
      description: "Tasks with deadline before this ISO 8601 datetime.",
      example: "2026-04-30T00:00:00Z",
    }),
    deadlineAfter: iso8601String.optional().openapi({
      description: "Tasks with deadline after this ISO 8601 datetime.",
      example: "2026-04-01T00:00:00Z",
    }),
    pageSize: z
      .string()
      .optional()
      .transform((v) => {
        if (v === undefined || v === "") return 50;
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0) return NaN;
        if (n === 0) return 50;
        return Math.min(n, 100);
      })
      .pipe(z.number().int().min(1).max(100))
      .openapi({
        description: "Maximum number of results per page (default 50, max 100).",
        example: 50,
      }),
    pageToken: z.string().optional().openapi({
      description: "Opaque cursor from a previous response's nextPageToken.",
    }),
  })
  .openapi("ListAssignedTasksQuery");

const AssignedTaskSchema = z
  .object({
    id: z.string().uuid().openapi({ description: "Task ID." }),
    title: z.string().openapi({ description: "Task title." }),
    body: z.string().nullable().openapi({ description: "Task body/description." }),
    archived: z.boolean().openapi({ description: "Whether the task is archived." }),
    done: z.boolean().openapi({ description: "The authenticated user's completion status." }),
    deadline: z.string().nullable().openapi({ description: "Task deadline (ISO 8601)." }),
    slackPermalink: z
      .string()
      .nullable()
      .openapi({ description: "Link to the original Slack message." }),
    createdBy: CreatedBySchema,
    createdAt: z.string().openapi({ description: "Creation time (ISO 8601)." }),
    updatedAt: z.string().openapi({ description: "Last update time (ISO 8601)." }),
  })
  .openapi("AssignedTask");

const ListAssignedTasksResponseSchema = z
  .object({
    tasks: z.array(AssignedTaskSchema),
    totalSize: z.number().int().openapi({ description: "Total matching tasks." }),
    nextPageToken: z.string().openapi({ description: "Cursor for the next page." }),
  })
  .openapi("ListAssignedTasksResponse");

// -- GET /tasks/owned --

const ListOwnedTasksQuerySchema = z
  .object({
    status: z.enum(["active", "archived"]).default("active").openapi({
      description: "Task archive status.",
      example: "active",
    }),
    deadlineBefore: iso8601String.optional().openapi({
      description: "Tasks with deadline before this ISO 8601 datetime.",
      example: "2026-04-30T00:00:00Z",
    }),
    deadlineAfter: iso8601String.optional().openapi({
      description: "Tasks with deadline after this ISO 8601 datetime.",
      example: "2026-04-01T00:00:00Z",
    }),
    pageSize: z
      .string()
      .optional()
      .transform((v) => {
        if (v === undefined || v === "") return 50;
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0) return NaN;
        if (n === 0) return 50;
        return Math.min(n, 100);
      })
      .pipe(z.number().int().min(1).max(100))
      .openapi({
        description: "Maximum number of results per page (default 50, max 100).",
        example: 50,
      }),
    pageToken: z.string().optional().openapi({
      description: "Opaque cursor from a previous response's nextPageToken.",
    }),
  })
  .openapi("ListOwnedTasksQuery");

const ProgressSchema = z
  .object({
    total: z.number().int().openapi({ description: "Total assignees." }),
    done: z.number().int().openapi({ description: "Number of completed assignees." }),
  })
  .openapi("Progress");

const OwnedTaskSchema = z
  .object({
    id: z.string().uuid().openapi({ description: "Task ID." }),
    title: z.string().openapi({ description: "Task title." }),
    body: z.string().nullable().openapi({ description: "Task body/description." }),
    archived: z.boolean().openapi({ description: "Whether the task is archived." }),
    deadline: z.string().nullable().openapi({ description: "Task deadline (ISO 8601)." }),
    slackPermalink: z
      .string()
      .nullable()
      .openapi({ description: "Link to the original Slack message." }),
    createdBy: CreatedBySchema,
    progress: ProgressSchema,
    createdAt: z.string().openapi({ description: "Creation time (ISO 8601)." }),
    updatedAt: z.string().openapi({ description: "Last update time (ISO 8601)." }),
  })
  .openapi("OwnedTask");

const ListOwnedTasksResponseSchema = z
  .object({
    tasks: z.array(OwnedTaskSchema),
    totalSize: z.number().int().openapi({ description: "Total matching tasks." }),
    nextPageToken: z.string().openapi({ description: "Cursor for the next page." }),
  })
  .openapi("ListOwnedTasksResponse");

// -- GET /tasks/owned/:id/assignees --

const ListAssigneesQuerySchema = z
  .object({
    done: z
      .enum(["true", "false"])
      .optional()
      .openapi({ description: "Filter by completion status." }),
    pageSize: z
      .string()
      .optional()
      .transform((v) => {
        if (v === undefined || v === "") return 50;
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0) return NaN;
        if (n === 0) return 50;
        return Math.min(n, 100);
      })
      .pipe(z.number().int().min(1).max(100))
      .openapi({
        description: "Maximum number of results per page (default 50, max 100).",
        example: 50,
      }),
    pageToken: z.string().optional().openapi({
      description: "Opaque cursor from a previous response's nextPageToken.",
    }),
  })
  .openapi("ListAssigneesQuery");

const AssigneeSchema = z
  .object({
    userId: z.string().uuid().openapi({ description: "Assignee user ID." }),
    displayName: z.string().openapi({ description: "Assignee display name." }),
    done: z.boolean().openapi({ description: "Whether the assignee has completed the task." }),
  })
  .openapi("Assignee");

const ListAssigneesResponseSchema = z
  .object({
    taskId: z.string().uuid().openapi({ description: "Task ID." }),
    assignees: z.array(AssigneeSchema),
    totalSize: z.number().int().openapi({ description: "Total matching assignees." }),
    nextPageToken: z.string().openapi({ description: "Cursor for the next page." }),
  })
  .openapi("ListAssigneesResponse");

// -- POST /tasks/owned/:id/archive & /unarchive --

const TaskIdParamSchema = z
  .object({
    id: z
      .string()
      .uuid()
      .openapi({ description: "Task ID.", example: "550e8400-e29b-41d4-a716-446655440000" }),
  })
  .openapi("TaskIdParam");

const ArchiveResponseSchema = z
  .object({
    id: z.string().uuid().openapi({ description: "Task ID." }),
    title: z.string().openapi({ description: "Task title." }),
    archived: z.boolean().openapi({ description: "Current archive status." }),
    updatedAt: z.string().openapi({ description: "Last update time (ISO 8601)." }),
  })
  .openapi("ArchiveResponse");

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const listAssignedTasksRoute = createRoute({
  method: "get",
  path: "/tasks",
  tags: ["Tasks"],
  summary: "List assigned tasks",
  description: "Returns tasks where the authenticated user is an assignee.",
  request: { query: ListAssignedTasksQuerySchema },
  responses: {
    200: {
      description: "Paginated list of assigned tasks.",
      content: { "application/json": { schema: ListAssignedTasksResponseSchema } },
    },
    401: UnauthorizedResponse,
    422: {
      description: "Validation error.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    429: RateLimitedResponse,
  },
});

const listOwnedTasksRoute = createRoute({
  method: "get",
  path: "/tasks/owned",
  tags: ["Tasks"],
  summary: "List owned tasks",
  description:
    "Returns tasks owned by the authenticated user (or all tasks for admins), with aggregated progress.",
  request: { query: ListOwnedTasksQuerySchema },
  responses: {
    200: {
      description: "Paginated list of owned tasks.",
      content: { "application/json": { schema: ListOwnedTasksResponseSchema } },
    },
    401: UnauthorizedResponse,
    422: {
      description: "Validation error.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    429: RateLimitedResponse,
  },
});

const listAssigneesRoute = createRoute({
  method: "get",
  path: "/tasks/owned/{id}/assignees",
  tags: ["Tasks"],
  summary: "List task assignees",
  description: "Returns assignee list with done status for a specific owned task.",
  request: {
    params: TaskIdParamSchema,
    query: ListAssigneesQuerySchema,
  },
  responses: {
    200: {
      description: "Paginated assignee list.",
      content: { "application/json": { schema: ListAssigneesResponseSchema } },
    },
    401: UnauthorizedResponse,
    403: {
      description: "Forbidden.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "Task not found.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    422: {
      description: "Validation error.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    429: RateLimitedResponse,
  },
});

const archiveTaskRoute = createRoute({
  method: "post",
  path: "/tasks/owned/{id}/archive",
  tags: ["Tasks"],
  summary: "Archive task",
  description: "Archives a task. Idempotent.",
  request: { params: TaskIdParamSchema },
  responses: {
    200: {
      description: "Task archived.",
      content: { "application/json": { schema: ArchiveResponseSchema } },
    },
    401: UnauthorizedResponse,
    403: {
      description: "Forbidden.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "Task not found.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    429: RateLimitedResponse,
  },
});

const unarchiveTaskRoute = createRoute({
  method: "post",
  path: "/tasks/owned/{id}/unarchive",
  tags: ["Tasks"],
  summary: "Unarchive task",
  description: "Unarchives a task. Idempotent.",
  request: { params: TaskIdParamSchema },
  responses: {
    200: {
      description: "Task unarchived.",
      content: { "application/json": { schema: ArchiveResponseSchema } },
    },
    401: UnauthorizedResponse,
    403: {
      description: "Forbidden.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "Task not found.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    429: RateLimitedResponse,
  },
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createTaskApiRoutes(deps: { taskService: TaskService; db: Database }) {
  const { taskService, db } = deps;
  const app = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) {
        const firstIssue = result.error.issues[0];
        return c.json(
          {
            error: {
              code: "validation_error",
              message: firstIssue?.message ?? "Invalid request parameters.",
            },
          },
          422,
        );
      }
    },
  });

  // -----------------------------------------------------------------------
  // GET /tasks — list assigned tasks
  // -----------------------------------------------------------------------

  app.openapi(listAssignedTasksRoute, async (c) => {
    const query = c.req.valid("query");
    const userId = c.get("apiUser").id;

    const isArchived = query.status === "archived";
    const fp = filterFingerprint({
      status: query.status,
      done: query.done,
      deadlineBefore: query.deadlineBefore,
      deadlineAfter: query.deadlineAfter,
    });

    // Decode cursor
    let cursorCondition: SQL | undefined;
    if (query.pageToken) {
      const cursor = decodePageToken(query.pageToken);
      if (!cursor || cursor.fp !== fp || !cursor.id || !validateTimestampCursor(cursor)) {
        return c.json(
          { error: { code: "validation_error", message: "Invalid or mismatched pageToken." } },
          422,
        );
      }
      const cursorTime = new Date(cursor.v);
      // Keyset: (assignedAt, taskId) < (cursorTime, cursorId)
      cursorCondition = or(
        lt(taskAssignees.assignedAt, cursorTime),
        and(eq(taskAssignees.assignedAt, cursorTime), lt(tasks.id, cursor.id)),
      );
    }

    // Build filter conditions (without cursor)
    const filterConditions: SQL[] = [
      eq(taskAssignees.userId, userId),
      eq(tasks.archived, isArchived),
    ];

    if (query.done !== undefined) {
      filterConditions.push(eq(taskAssignees.done, query.done === "true"));
    }
    if (query.deadlineBefore) {
      filterConditions.push(lt(tasks.deadline, new Date(query.deadlineBefore)));
    }
    if (query.deadlineAfter) {
      filterConditions.push(gt(tasks.deadline, new Date(query.deadlineAfter)));
    }

    // Count total
    const [{ total }] = await db
      .select({ total: drizzleCount() })
      .from(taskAssignees)
      .innerJoin(tasks, eq(taskAssignees.taskId, tasks.id))
      .where(and(...filterConditions));

    // Fetch page with cursor
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
      .limit(query.pageSize + 1);

    const hasNext = rows.length > query.pageSize;
    const page = hasNext ? rows.slice(0, query.pageSize) : rows;

    // Resolve creators
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
        ? encodePageToken({
            fp,
            v: lastRow.assignedAt.toISOString(),
            id: lastRow.taskId,
          })
        : "";

    return c.json(
      {
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
      },
      200,
    );
  });

  // -----------------------------------------------------------------------
  // GET /tasks/owned — list owned tasks
  // -----------------------------------------------------------------------

  app.openapi(listOwnedTasksRoute, async (c) => {
    const query = c.req.valid("query");
    const apiUser = c.get("apiUser");
    const apiRole = c.get("apiRole");
    const isAdmin = apiRole === "admin";

    const isArchived = query.status === "archived";
    const fp = filterFingerprint({
      status: query.status,
      deadlineBefore: query.deadlineBefore,
      deadlineAfter: query.deadlineAfter,
    });

    let cursorCondition: SQL | undefined;
    if (query.pageToken) {
      const cursor = decodePageToken(query.pageToken);
      if (!cursor || cursor.fp !== fp || !cursor.id || !validateTimestampCursor(cursor)) {
        return c.json(
          { error: { code: "validation_error", message: "Invalid or mismatched pageToken." } },
          422,
        );
      }
      const cursorTime = new Date(cursor.v);
      cursorCondition = or(
        lt(tasks.createdAt, cursorTime),
        and(eq(tasks.createdAt, cursorTime), lt(tasks.id, cursor.id)),
      );
    }

    // Build filter conditions on tasks table
    const filterConditions: SQL[] = [eq(tasks.archived, isArchived)];
    if (query.deadlineBefore) {
      filterConditions.push(lt(tasks.deadline, new Date(query.deadlineBefore)));
    }
    if (query.deadlineAfter) {
      filterConditions.push(gt(tasks.deadline, new Date(query.deadlineAfter)));
    }

    if (isAdmin) {
      // Admin sees all tasks
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
        .limit(query.pageSize + 1);

      const hasNext = rows.length > query.pageSize;
      const page = hasNext ? rows.slice(0, query.pageSize) : rows;

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

      return c.json(
        {
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
        },
        200,
      );
    }

    // Non-admin: tasks where user is an owner
    const ownerFilter: SQL[] = [...filterConditions, eq(taskOwners.userId, apiUser.id)];
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
      .limit(query.pageSize + 1);

    const hasNext = rows.length > query.pageSize;
    const page = hasNext ? rows.slice(0, query.pageSize) : rows;

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

    return c.json(
      {
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
      },
      200,
    );
  });

  // -----------------------------------------------------------------------
  // GET /tasks/owned/:id/assignees
  // -----------------------------------------------------------------------

  app.openapi(listAssigneesRoute, async (c) => {
    const { id: taskId } = c.req.valid("param");
    const query = c.req.valid("query");
    const apiUser = c.get("apiUser");
    const apiRole = c.get("apiRole");
    const isAdmin = apiRole === "admin";

    // Check task exists
    const task = await taskService.getTask(taskId);
    if (!task) {
      return c.json({ error: { code: "not_found", message: "Task not found." } }, 404);
    }

    // Check authorization
    if (!isAdmin) {
      const isOwner = await taskService.isTaskOwner(taskId, apiUser.id);
      if (!isOwner) {
        return c.json(
          { error: { code: "forbidden", message: "You are not an owner of this task." } },
          403,
        );
      }
    }

    const fp = filterFingerprint({ done: query.done });

    let cursorCondition: SQL | undefined;
    if (query.pageToken) {
      const cursor = decodePageToken(query.pageToken);
      if (!cursor || cursor.fp !== fp || !UUID_REGEX.test(cursor.v)) {
        return c.json(
          { error: { code: "validation_error", message: "Invalid or mismatched pageToken." } },
          422,
        );
      }
      cursorCondition = lt(taskAssignees.userId, cursor.v);
    }

    // Build filter conditions
    const filterConditions: SQL[] = [eq(taskAssignees.taskId, taskId)];
    if (query.done !== undefined) {
      filterConditions.push(eq(taskAssignees.done, query.done === "true"));
    }

    // Count total
    const [{ total }] = await db
      .select({ total: drizzleCount() })
      .from(taskAssignees)
      .where(and(...filterConditions));

    // Fetch page with cursor
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
      .limit(query.pageSize + 1);

    const hasNext = rows.length > query.pageSize;
    const page = hasNext ? rows.slice(0, query.pageSize) : rows;

    const lastRow = page[page.length - 1];
    const nextPageToken = hasNext && lastRow ? encodePageToken({ fp, v: lastRow.userId }) : "";

    return c.json(
      {
        taskId,
        assignees: page.map((r) => ({
          userId: r.userId,
          displayName: r.displayName,
          done: r.done,
        })),
        totalSize: total,
        nextPageToken,
      },
      200,
    );
  });

  // -----------------------------------------------------------------------
  // POST /tasks/owned/:id/archive
  // -----------------------------------------------------------------------

  app.openapi(archiveTaskRoute, async (c) => {
    const { id: taskId } = c.req.valid("param");
    const apiUser = c.get("apiUser");
    const apiRole = c.get("apiRole");
    const isAdmin = apiRole === "admin";

    const task = await taskService.getTask(taskId);
    if (!task) {
      return c.json({ error: { code: "not_found", message: "Task not found." } }, 404);
    }

    if (!isAdmin) {
      const isOwner = await taskService.isTaskOwner(taskId, apiUser.id);
      if (!isOwner) {
        return c.json(
          { error: { code: "forbidden", message: "You are not an owner of this task." } },
          403,
        );
      }
    }

    // Idempotent: if already archived, return current state
    if (task.archived) {
      return c.json(
        {
          id: task.id,
          title: task.title,
          archived: task.archived,
          updatedAt: task.updatedAt.toISOString(),
        },
        200,
      );
    }

    const updated = await taskService.archiveTask(taskId);
    return c.json(
      {
        id: updated.id,
        title: updated.title,
        archived: updated.archived,
        updatedAt: updated.updatedAt.toISOString(),
      },
      200,
    );
  });

  // -----------------------------------------------------------------------
  // POST /tasks/owned/:id/unarchive
  // -----------------------------------------------------------------------

  app.openapi(unarchiveTaskRoute, async (c) => {
    const { id: taskId } = c.req.valid("param");
    const apiUser = c.get("apiUser");
    const apiRole = c.get("apiRole");
    const isAdmin = apiRole === "admin";

    const task = await taskService.getTask(taskId);
    if (!task) {
      return c.json({ error: { code: "not_found", message: "Task not found." } }, 404);
    }

    if (!isAdmin) {
      const isOwner = await taskService.isTaskOwner(taskId, apiUser.id);
      if (!isOwner) {
        return c.json(
          { error: { code: "forbidden", message: "You are not an owner of this task." } },
          403,
        );
      }
    }

    // Idempotent: if already active, return current state
    if (!task.archived) {
      return c.json(
        {
          id: task.id,
          title: task.title,
          archived: task.archived,
          updatedAt: task.updatedAt.toISOString(),
        },
        200,
      );
    }

    const updated = await taskService.unarchiveTask(taskId);
    return c.json(
      {
        id: updated.id,
        title: updated.title,
        archived: updated.archived,
        updatedAt: updated.updatedAt.toISOString(),
      },
      200,
    );
  });

  return app;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Get progress (total/done counts) for a batch of task IDs. */
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
