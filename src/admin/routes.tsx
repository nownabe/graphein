import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";
import type { UserService } from "../users/service";
import type { SnippetService } from "../snippets/service";
import type { SettingsService } from "../settings/service";
import { AdminUsersPage, AdminUsersList } from "../views/pages/admin-users.tsx";
import {
  AdminSnippetChannelsPage,
  AdminSnippetChannelsList,
} from "../views/pages/admin-snippet-channels.tsx";
import { AdminSettingsPage, AdminSettingsForm } from "../views/pages/admin-settings.tsx";

export interface AdminRoutesDeps {
  authMiddleware: MiddlewareHandler;
  adminMiddleware: MiddlewareHandler;
  userService: UserService;
  snippetService: SnippetService;
  settingsService: SettingsService;
  devMode: boolean;
}

export function createAdminRoutes(deps: AdminRoutesDeps) {
  const { authMiddleware, adminMiddleware, userService, snippetService, settingsService, devMode } =
    deps;
  const adminRoutes = new Hono();

  adminRoutes.use("/admin/*", authMiddleware);
  adminRoutes.use("/admin/*", adminMiddleware);

  function getLocale(c: { req: { raw: Request } }): string {
    const cookie = getCookie(c as any, "locale");
    return cookie === "ja" ? "ja" : "en";
  }

  function getTheme(c: { req: { raw: Request } }): string {
    const cookie = getCookie(c as any, "theme");
    return cookie === "light" ? "light" : "dark";
  }

  adminRoutes.get("/admin/users", async (c) => {
    const { sub: userId, name: displayName } = c.get("jwtPayload");
    const locale = getLocale(c);
    const theme = getTheme(c);
    const users = await userService.listAllUsers();
    return c.html(
      <AdminUsersPage
        users={users}
        currentUserId={userId}
        displayName={displayName}
        locale={locale}
        theme={theme}
        devMode={devMode}
      />,
    );
  });

  adminRoutes.post("/admin/users/:id/promote", async (c) => {
    const targetId = c.req.param("id");
    const { sub: userId } = c.get("jwtPayload");
    const locale = getLocale(c);

    const target = await userService.findUserById(targetId);
    if (!target) return c.text("Not found", 404);

    await userService.setUserRole(targetId, "admin");

    const users = await userService.listAllUsers();
    return c.html(<AdminUsersList users={users} currentUserId={userId} locale={locale} />);
  });

  adminRoutes.post("/admin/users/:id/demote", async (c) => {
    const targetId = c.req.param("id");
    const { sub: userId } = c.get("jwtPayload");
    const locale = getLocale(c);

    const target = await userService.findUserById(targetId);
    if (!target) return c.text("Not found", 404);

    // Ensure at least one admin remains after the demotion. This also
    // protects the lone admin from removing themselves.
    const remaining = await userService.countAdminsExcluding(targetId);
    if (remaining < 1) {
      return c.text("At least one admin must remain", 400);
    }

    await userService.setUserRole(targetId, "user");

    const users = await userService.listAllUsers();
    return c.html(<AdminUsersList users={users} currentUserId={userId} locale={locale} />);
  });

  // Snippet channel management
  adminRoutes.get("/admin/snippet-channels", async (c) => {
    const { name: displayName } = c.get("jwtPayload");
    const locale = getLocale(c);
    const theme = getTheme(c);
    const channels = await snippetService.listSnippetChannels();
    return c.html(
      <AdminSnippetChannelsPage
        channels={channels}
        displayName={displayName}
        locale={locale}
        theme={theme}
        devMode={devMode}
      />,
    );
  });

  adminRoutes.post("/admin/snippet-channels", async (c) => {
    const locale = getLocale(c);
    const body = await c.req.parseBody();
    const slackChannelId = (body.slack_channel_id as string)?.trim();
    if (!slackChannelId) return c.text("Bad Request", 400);

    await snippetService.addSnippetChannel(slackChannelId);
    const channels = await snippetService.listSnippetChannels();
    return c.html(<AdminSnippetChannelsList channels={channels} locale={locale} />);
  });

  adminRoutes.delete("/admin/snippet-channels/:id", async (c) => {
    const id = c.req.param("id");
    const locale = getLocale(c);

    await snippetService.removeSnippetChannel(id);
    const channels = await snippetService.listSnippetChannels();
    return c.html(<AdminSnippetChannelsList channels={channels} locale={locale} />);
  });

  // Settings management
  adminRoutes.get("/admin/settings", async (c) => {
    const { name: displayName } = c.get("jwtPayload");
    const locale = getLocale(c);
    const theme = getTheme(c);
    const fiscalQuarterStartMonth = await settingsService.getFiscalQuarterStartMonth();
    return c.html(
      <AdminSettingsPage
        fiscalQuarterStartMonth={fiscalQuarterStartMonth}
        displayName={displayName}
        locale={locale}
        theme={theme}
        devMode={devMode}
      />,
    );
  });

  adminRoutes.post("/admin/settings/fiscal-quarter", async (c) => {
    const locale = getLocale(c);
    const body = await c.req.parseBody();
    const month = Number(body.fiscal_quarter_start_month);
    if (month >= 1 && month <= 12) {
      await settingsService.setFiscalQuarterStartMonth(month);
    }
    const fiscalQuarterStartMonth = await settingsService.getFiscalQuarterStartMonth();
    return c.html(
      <AdminSettingsForm fiscalQuarterStartMonth={fiscalQuarterStartMonth} locale={locale} />,
    );
  });

  return adminRoutes;
}
