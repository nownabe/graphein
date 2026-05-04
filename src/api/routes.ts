import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import type { Database } from "../db/client";
import type { KudosService } from "../kudos/service";
import type { SnippetService } from "../snippets/service";
import type { TaskService } from "../tasks/service";
import type { UserService } from "../users/service";
import { createAdminApiRoutes } from "./admin";
import { createKudosApiRoutes } from "./kudos";
import { createTaskApiRoutes } from "./tasks";
import { createSnippetApiRoutes } from "./snippets";

interface ApiRouteDeps {
  taskService: TaskService;
  userService: UserService;
  snippetService: SnippetService;
  kudosService: KudosService;
  db: Database;
}

/**
 * Creates the OpenAPIHono sub-app for the JSON API.
 *
 * The returned app is intended to be mounted at `/api/v1` on the main Hono app.
 * Auth and rate-limit middleware are applied in `app.ts` before requests reach
 * these routes, so the sub-app itself does not apply them.
 */
export function createApiRoutes(deps: ApiRouteDeps) {
  const app = new OpenAPIHono();

  // --- Security scheme ---
  app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    description: "API key passed as a Bearer token. Generate keys via the admin UI or API.",
  });

  // --- OpenAPI spec endpoint ---
  app.doc("/doc", {
    openapi: "3.0.0",
    info: {
      title: "Graphein API",
      version: "1.0.0",
      description:
        "JSON API for Graphein — interact with tasks, snippets, and kudos programmatically.",
    },
    security: [{ bearerAuth: [] }],
  });

  // --- Scalar API reference UI ---
  app.get("/reference", Scalar({ url: "/api/v1/doc" }));

  // --- Task API routes ---
  const taskApiRoutes = createTaskApiRoutes({
    taskService: deps.taskService,
    db: deps.db,
  });
  app.route("/", taskApiRoutes);

  // --- Snippet API routes ---
  const snippetApiRoutes = createSnippetApiRoutes({ snippetService: deps.snippetService });
  app.route("/", snippetApiRoutes);

  // --- Kudos API routes ---
  const kudosApiRoutes = createKudosApiRoutes({
    kudosService: deps.kudosService,
  });
  app.route("/", kudosApiRoutes);

  // --- Admin API routes ---
  const adminApiRoutes = createAdminApiRoutes({
    userService: deps.userService,
    snippetService: deps.snippetService,
    kudosService: deps.kudosService,
    db: deps.db,
  });
  app.route("/", adminApiRoutes);

  return app;
}
