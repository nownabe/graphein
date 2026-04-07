import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { logger } from "hono/logger";
import authRoutes from "./auth/routes.tsx";
import taskRoutes from "./tasks/routes.tsx";
import { receiver } from "./slack/bolt";

const app = new Hono();

app.use("*", logger());
app.use("/public/*", serveStatic({ root: "./" }));

app.get("/healthz", (c) => c.text("ok"));

// Auth routes
app.route("/auth", authRoutes);

// Slack events/interactions (HTTP mode only, not used in Socket Mode)
if (receiver != null) {
  const r = receiver;
  app.post("/slack/events", (c) => r.handleRequest(c));
  app.post("/slack/interactions", (c) => r.handleRequest(c));
}

// Task routes (includes home page)
app.route("/", taskRoutes);

export default app;
