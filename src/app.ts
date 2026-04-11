import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { logger } from "hono/logger";
import { setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import authRoutes from "./auth/routes.tsx";
import taskRoutes from "./tasks/routes.tsx";
import adminRoutes from "./admin/routes.tsx";
import { receiver } from "./slack/bolt";

const app = new Hono();

app.use("*", logger());
app.use("/public/*", serveStatic({ root: "./" }));

app.get("/healthz", (c) => c.text("ok"));

// Locale switching
app.get("/locale/:lang", (c) => {
  const lang = c.req.param("lang");
  const locale = lang === "en" ? "en" : "ja";
  setCookie(c, "locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "Lax",
  });
  const referer = c.req.header("Referer") || "/";
  return c.redirect(referer, 302);
});

// Dev hot reload SSE endpoint
if (process.env.NODE_ENV !== "production") {
  app.get("/dev/reload", (c) => {
    return streamSSE(c, async (stream) => {
      while (true) {
        await stream.writeSSE({ data: "ping", event: "ping" });
        await stream.sleep(1000);
      }
    });
  });
} else {
  app.get("/dev/reload", (c) => c.notFound());
}

// Auth routes
app.route("/auth", authRoutes);

// Slack events/interactions (HTTP mode only, not used in Socket Mode)
if (receiver != null) {
  const r = receiver;
  app.post("/slack/events", (c) => r.handleRequest(c));
  app.post("/slack/interactions", (c) => r.handleRequest(c));
}

// Admin routes
app.route("/", adminRoutes);

// Task routes (includes home page)
app.route("/", taskRoutes);

export default app;
