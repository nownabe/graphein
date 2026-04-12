import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { logger } from "hono/logger";
import { getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import authRoutes from "./auth/routes.tsx";
import taskRoutes from "./tasks/routes.tsx";
import adminRoutes from "./admin/routes.tsx";
import { receiver } from "./slack/bolt";
import { verifyToken } from "./auth/session";
import { updateUserLocale, updateUserTheme } from "./users/service";
import { csrfMiddleware } from "./auth/csrf";

const app = new Hono();

app.use("*", logger());
app.use("/public/*", serveStatic({ root: "./" }));

// Anti-clickjacking: prevent framing by any origin
app.use("*", async (c, next) => {
  await next();
  c.header("Content-Security-Policy", "frame-ancestors 'none'");
  c.header("X-Frame-Options", "DENY");
});

// CSRF protection for all state-changing requests
app.use("*", csrfMiddleware);

app.get("/healthz", (c) => c.text("ok"));

// Locale switching
app.post("/locale/:lang", async (c) => {
  const lang = c.req.param("lang");
  const locale = lang === "ja" ? "ja" : "en";
  setCookie(c, "locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "Lax",
  });

  // Persist locale to DB if user is logged in
  const token = getCookie(c, "token");
  if (token) {
    const payload = await verifyToken(token);
    if (payload) {
      await updateUserLocale(payload.sub, locale);
    }
  }

  // htmx request — return 200 so the client can do a full page reload
  if (c.req.header("HX-Request")) {
    c.header("HX-Refresh", "true");
    return c.body(null, 200);
  }
  return c.redirect("/tasks", 302);
});

// Theme switching
app.post("/theme/:mode", async (c) => {
  const mode = c.req.param("mode");
  const theme = mode === "light" ? "light" : "dark";
  setCookie(c, "theme", theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "Lax",
  });

  const token = getCookie(c, "token");
  if (token) {
    const payload = await verifyToken(token);
    if (payload) {
      await updateUserTheme(payload.sub, theme);
    }
  }

  return c.body(null, 200);
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
