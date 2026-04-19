import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";

/**
 * Creates the OpenAPIHono sub-app for the JSON API.
 *
 * The returned app is intended to be mounted at `/api/v1` on the main Hono app.
 * Auth and rate-limit middleware are applied in `app.ts` before requests reach
 * these routes, so the sub-app itself does not apply them.
 */
export function createApiRoutes() {
  const app = new OpenAPIHono();

  // --- OpenAPI spec endpoint ---
  app.doc("/doc", {
    openapi: "3.0.0",
    info: {
      title: "Graphein API",
      version: "1.0.0",
      description:
        "JSON API for Graphein — interact with tasks, snippets, and kudos programmatically.",
    },
  });

  // --- Scalar API reference UI ---
  app.get("/reference", Scalar({ url: "/api/v1/doc" }));

  return app;
}
