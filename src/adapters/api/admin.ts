import { z } from "@hono/zod-openapi";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { or, ilike, asc, and, sql, count as drizzleCount } from "drizzle-orm";
import type { Database } from "../../db/client";
import { users } from "../../db/schema";
import type { UserService } from "../../users/service";
import type { SnippetService } from "../../snippets/service";
import type { KudosService } from "../../kudos/service";
import { ErrorResponseSchema, UnauthorizedResponse, RateLimitedResponse } from "./schemas";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PageCursor {
  fp: string;
  v: string;
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function filterFingerprint(params: Record<string, string | undefined>): string {
  const sorted = Object.entries(params)
    .filter(([_, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return sorted;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const AdminUserSchema = z
  .object({
    id: z.string().uuid().openapi({ description: "User ID." }),
    slackUserId: z.string().openapi({ description: "Slack user ID." }),
    email: z.string().openapi({ description: "User email." }),
    displayName: z.string().openapi({ description: "Display name." }),
    avatarUrl: z.string().nullable().openapi({ description: "Avatar URL." }),
    role: z.string().openapi({ description: "User role (user or admin)." }),
    locale: z.string().openapi({ description: "User locale." }),
    deactivatedAt: z.string().nullable().openapi({ description: "Deactivation timestamp." }),
    createdAt: z.string().openapi({ description: "Creation timestamp." }),
  })
  .openapi("AdminUser");

const ListUsersQuerySchema = z
  .object({
    query: z.string().optional().openapi({
      description: "Partial match on displayName or email (case-insensitive).",
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
      .openapi({ description: "Max results per page (default 50, max 100).", example: 50 }),
    pageToken: z.string().optional().openapi({
      description: "Opaque cursor from a previous response's nextPageToken.",
    }),
  })
  .openapi("ListAdminUsersQuery");

const ListUsersResponseSchema = z
  .object({
    users: z.array(AdminUserSchema),
    totalSize: z.number().int().openapi({ description: "Total matching users." }),
    nextPageToken: z.string().openapi({ description: "Cursor for the next page." }),
  })
  .openapi("ListAdminUsersResponse");

const DeactivateUserResponseSchema = z
  .object({
    id: z.string().uuid().openapi({ description: "User ID." }),
    displayName: z.string().openapi({ description: "Display name." }),
    deactivatedAt: z.string().openapi({ description: "Deactivation timestamp." }),
  })
  .openapi("DeactivateUserResponse");

const ChannelSchema = z
  .object({
    id: z.string().uuid().openapi({ description: "Channel record ID." }),
    slackChannelId: z.string().openapi({ description: "Slack channel ID." }),
    createdAt: z.string().openapi({ description: "Creation timestamp." }),
  })
  .openapi("AdminChannel");

const AddChannelBodySchema = z
  .object({
    slackChannelId: z.string().min(1).openapi({ description: "Slack channel ID to add." }),
  })
  .openapi("AddChannelRequest");

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const listUsersRoute = createRoute({
  method: "get",
  path: "/admin/users",
  tags: ["Admin"],
  security: [{ bearerAuth: [] }],
  summary: "List users",
  description: "Returns all users. Requires admin role.",
  request: { query: ListUsersQuerySchema },
  responses: {
    200: {
      description: "Paginated list of users.",
      content: { "application/json": { schema: ListUsersResponseSchema } },
    },
    401: UnauthorizedResponse,
    403: {
      description: "Forbidden — admin role required.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    422: {
      description: "Validation error.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    429: RateLimitedResponse,
  },
});

const deactivateUserRoute = createRoute({
  method: "post",
  path: "/admin/users/{id}/deactivate",
  tags: ["Admin"],
  security: [{ bearerAuth: [] }],
  summary: "Deactivate user",
  description: "Sets deactivatedAt on a user. Idempotent. Requires admin role.",
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: "User deactivated.",
      content: { "application/json": { schema: DeactivateUserResponseSchema } },
    },
    422: {
      description: "Validation error — cannot deactivate yourself.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    401: UnauthorizedResponse,
    403: {
      description: "Forbidden — admin role required.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "User not found.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    429: RateLimitedResponse,
  },
});

const listSnippetChannelsRoute = createRoute({
  method: "get",
  path: "/admin/snippetChannels",
  tags: ["Admin"],
  security: [{ bearerAuth: [] }],
  summary: "List snippet channels",
  description: "Returns all snippet-monitored channels. Requires admin role.",
  responses: {
    200: {
      description: "List of snippet channels.",
      content: {
        "application/json": {
          schema: z.object({ snippetChannels: z.array(ChannelSchema) }),
        },
      },
    },
    401: UnauthorizedResponse,
    403: {
      description: "Forbidden — admin role required.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    429: RateLimitedResponse,
  },
});

const addSnippetChannelRoute = createRoute({
  method: "post",
  path: "/admin/snippetChannels",
  tags: ["Admin"],
  security: [{ bearerAuth: [] }],
  summary: "Add snippet channel",
  description: "Adds a snippet-monitored channel. Idempotent. Requires admin role.",
  request: {
    body: { content: { "application/json": { schema: AddChannelBodySchema } } },
  },
  responses: {
    200: {
      description: "Channel already exists.",
      content: { "application/json": { schema: ChannelSchema } },
    },
    201: {
      description: "Channel created.",
      content: { "application/json": { schema: ChannelSchema } },
    },
    401: UnauthorizedResponse,
    403: {
      description: "Forbidden — admin role required.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    422: {
      description: "Validation error.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    429: RateLimitedResponse,
  },
});

const deleteSnippetChannelRoute = createRoute({
  method: "delete",
  path: "/admin/snippetChannels/{id}",
  tags: ["Admin"],
  security: [{ bearerAuth: [] }],
  summary: "Remove snippet channel",
  description: "Removes a snippet-monitored channel. Requires admin role.",
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    204: { description: "Channel removed." },
    401: UnauthorizedResponse,
    403: {
      description: "Forbidden — admin role required.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "Channel not found.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    429: RateLimitedResponse,
  },
});

const listKudosChannelsRoute = createRoute({
  method: "get",
  path: "/admin/kudosChannels",
  tags: ["Admin"],
  security: [{ bearerAuth: [] }],
  summary: "List kudos channels",
  description: "Returns all kudos-monitored channels. Requires admin role.",
  responses: {
    200: {
      description: "List of kudos channels.",
      content: {
        "application/json": {
          schema: z.object({ kudosChannels: z.array(ChannelSchema) }),
        },
      },
    },
    401: UnauthorizedResponse,
    403: {
      description: "Forbidden — admin role required.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    429: RateLimitedResponse,
  },
});

const addKudosChannelRoute = createRoute({
  method: "post",
  path: "/admin/kudosChannels",
  tags: ["Admin"],
  security: [{ bearerAuth: [] }],
  summary: "Add kudos channel",
  description: "Adds a kudos-monitored channel. Idempotent. Requires admin role.",
  request: {
    body: { content: { "application/json": { schema: AddChannelBodySchema } } },
  },
  responses: {
    200: {
      description: "Channel already exists.",
      content: { "application/json": { schema: ChannelSchema } },
    },
    201: {
      description: "Channel created.",
      content: { "application/json": { schema: ChannelSchema } },
    },
    401: UnauthorizedResponse,
    403: {
      description: "Forbidden — admin role required.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    422: {
      description: "Validation error.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    429: RateLimitedResponse,
  },
});

const deleteKudosChannelRoute = createRoute({
  method: "delete",
  path: "/admin/kudosChannels/{id}",
  tags: ["Admin"],
  security: [{ bearerAuth: [] }],
  summary: "Remove kudos channel",
  description: "Removes a kudos-monitored channel. Requires admin role.",
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    204: { description: "Channel removed." },
    401: UnauthorizedResponse,
    403: {
      description: "Forbidden — admin role required.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "Channel not found.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    429: RateLimitedResponse,
  },
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

interface AdminApiDeps {
  userService: UserService;
  snippetService: SnippetService;
  kudosService: KudosService;
  db: Database;
}

export function createAdminApiRoutes(deps: AdminApiDeps) {
  const { userService, snippetService, kudosService, db } = deps;

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

  // Admin role guard helper
  function requireAdmin(c: any): Response | null {
    const apiRole = c.get("apiRole");
    if (apiRole !== "admin") {
      return c.json({ error: { code: "forbidden", message: "Admin role required." } }, 403);
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // GET /admin/users
  // -------------------------------------------------------------------------

  app.openapi(listUsersRoute, async (c) => {
    const denied = requireAdmin(c);
    if (denied) return denied as any;

    const query = c.req.valid("query");

    const fp = filterFingerprint({ query: query.query });

    // Build filter
    const searchQuery = query.query?.trim();
    const filterCondition = searchQuery
      ? or(ilike(users.displayName, `%${searchQuery}%`), ilike(users.email, `%${searchQuery}%`))
      : undefined;

    // Decode cursor
    let cursorCondition: any;
    if (query.pageToken) {
      const cursor = decodePageToken(query.pageToken);
      if (!cursor || cursor.fp !== fp || !cursor.id || !UUID_REGEX.test(cursor.id)) {
        return c.json(
          { error: { code: "validation_error", message: "Invalid or mismatched pageToken." } },
          422,
        );
      }
      // Keyset: (displayName, id) > (cursorName, cursorId)
      cursorCondition = or(
        sql`${users.displayName} > ${cursor.v}`,
        and(sql`${users.displayName} = ${cursor.v}`, sql`${users.id} > ${cursor.id}`),
      );
    }

    // Count total
    const [{ total }] = await db
      .select({ total: drizzleCount() })
      .from(users)
      .where(filterCondition);

    // Fetch page
    const allConditions = [filterCondition, cursorCondition].filter(Boolean);
    const where = allConditions.length > 0 ? and(...allConditions) : undefined;

    const rows = await db
      .select()
      .from(users)
      .where(where)
      .orderBy(asc(users.displayName), asc(users.id))
      .limit(query.pageSize + 1);

    const hasNext = rows.length > query.pageSize;
    const page = hasNext ? rows.slice(0, query.pageSize) : rows;

    const lastRow = page[page.length - 1];
    const nextPageToken =
      hasNext && lastRow ? encodePageToken({ fp, v: lastRow.displayName, id: lastRow.id }) : "";

    return c.json(
      {
        users: page.map((u) => ({
          id: u.id,
          slackUserId: u.slackUserId,
          email: u.email,
          displayName: u.displayName,
          avatarUrl: u.avatarUrl,
          role: u.role,
          locale: u.locale,
          deactivatedAt: u.deactivatedAt?.toISOString() ?? null,
          createdAt: u.createdAt.toISOString(),
        })),
        totalSize: total,
        nextPageToken,
      },
      200,
    );
  });

  // -------------------------------------------------------------------------
  // POST /admin/users/:id/deactivate
  // -------------------------------------------------------------------------

  app.openapi(deactivateUserRoute, async (c) => {
    const denied = requireAdmin(c);
    if (denied) return denied as any;

    const { id } = c.req.valid("param");
    const apiUser = c.get("apiUser");

    if (id === apiUser.id) {
      return c.json(
        { error: { code: "validation_error", message: "Cannot deactivate yourself." } },
        422,
      );
    }

    const user = await userService.findUserById(id);
    if (!user) {
      return c.json({ error: { code: "not_found", message: "User not found." } }, 404);
    }

    // Idempotent: if already deactivated, return current state
    if (user.deactivatedAt) {
      return c.json(
        {
          id: user.id,
          displayName: user.displayName,
          deactivatedAt: user.deactivatedAt.toISOString(),
        },
        200,
      );
    }

    const updated = await userService.deactivateUser(id);
    return c.json(
      {
        id: updated!.id,
        displayName: updated!.displayName,
        deactivatedAt: updated!.deactivatedAt!.toISOString(),
      },
      200,
    );
  });

  // -------------------------------------------------------------------------
  // GET /admin/snippetChannels
  // -------------------------------------------------------------------------

  app.openapi(listSnippetChannelsRoute, async (c) => {
    const denied = requireAdmin(c);
    if (denied) return denied as any;

    const channels = await snippetService.listSnippetChannels();
    return c.json(
      {
        snippetChannels: channels.map((ch) => ({
          id: ch.id,
          slackChannelId: ch.slackChannelId,
          createdAt: ch.createdAt.toISOString(),
        })),
      },
      200,
    );
  });

  // -------------------------------------------------------------------------
  // POST /admin/snippetChannels
  // -------------------------------------------------------------------------

  app.openapi(addSnippetChannelRoute, async (c) => {
    const denied = requireAdmin(c);
    if (denied) return denied as any;

    const { slackChannelId } = c.req.valid("json");

    const result = await snippetService.addSnippetChannel(slackChannelId);
    const { channel } = result;
    return c.json(
      {
        id: channel.id,
        slackChannelId: channel.slackChannelId,
        createdAt: channel.createdAt.toISOString(),
      },
      result.created ? 201 : 200,
    );
  });

  // -------------------------------------------------------------------------
  // DELETE /admin/snippetChannels/:id
  // -------------------------------------------------------------------------

  app.openapi(deleteSnippetChannelRoute, async (c) => {
    const denied = requireAdmin(c);
    if (denied) return denied as any;

    const { id } = c.req.valid("param");

    const result = await snippetService.removeSnippetChannel(id);
    if (!result.found) {
      return c.json({ error: { code: "not_found", message: "Snippet channel not found." } }, 404);
    }

    return c.body(null, 204);
  });

  // -------------------------------------------------------------------------
  // GET /admin/kudosChannels
  // -------------------------------------------------------------------------

  app.openapi(listKudosChannelsRoute, async (c) => {
    const denied = requireAdmin(c);
    if (denied) return denied as any;

    const channels = await kudosService.listKudosChannels();
    return c.json(
      {
        kudosChannels: channels.map((ch) => ({
          id: ch.id,
          slackChannelId: ch.slackChannelId,
          createdAt: ch.createdAt.toISOString(),
        })),
      },
      200,
    );
  });

  // -------------------------------------------------------------------------
  // POST /admin/kudosChannels
  // -------------------------------------------------------------------------

  app.openapi(addKudosChannelRoute, async (c) => {
    const denied = requireAdmin(c);
    if (denied) return denied as any;

    const { slackChannelId } = c.req.valid("json");

    const result = await kudosService.addKudosChannel(slackChannelId);
    const { channel } = result;
    return c.json(
      {
        id: channel.id,
        slackChannelId: channel.slackChannelId,
        createdAt: channel.createdAt.toISOString(),
      },
      result.created ? 201 : 200,
    );
  });

  // -------------------------------------------------------------------------
  // DELETE /admin/kudosChannels/:id
  // -------------------------------------------------------------------------

  app.openapi(deleteKudosChannelRoute, async (c) => {
    const denied = requireAdmin(c);
    if (denied) return denied as any;

    const { id } = c.req.valid("param");

    const result = await kudosService.removeKudosChannel(id);
    if (!result.found) {
      return c.json({ error: { code: "not_found", message: "Kudos channel not found." } }, 404);
    }

    return c.body(null, 204);
  });

  return app;
}
