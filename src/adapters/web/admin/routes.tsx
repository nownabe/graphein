import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";
import type { UserService } from "../../../application/users/service";
import type { SnippetService } from "../../../application/snippets/service";
import type { KudosService } from "../../../application/kudos/service";
import type { SettingsService } from "../../../application/settings/service";
import type { ResolveChannelName } from "../../../config";
import { AdminUsersPage, AdminUsersListInner } from "../../../views/pages/admin-users.tsx";
import {
  AdminSnippetChannelsPage,
  AdminSnippetChannelsList,
} from "../../../views/pages/admin-snippet-channels.tsx";
import {
  AdminKudosChannelsPage,
  AdminKudosChannelsList,
} from "../../../views/pages/admin-kudos-channels.tsx";
import { AdminSettingsPage, AdminSettingsForm } from "../../../views/pages/admin-settings.tsx";

export interface AdminRoutesDeps {
  authMiddleware: MiddlewareHandler;
  adminMiddleware: MiddlewareHandler;
  userService: UserService;
  snippetService: SnippetService;
  kudosService: KudosService;
  settingsService: SettingsService;
  resolveChannelName: ResolveChannelName;
  devMode: boolean;
}

export function createAdminRoutes(deps: AdminRoutesDeps) {
  const {
    authMiddleware,
    adminMiddleware,
    userService,
    snippetService,
    kudosService,
    settingsService,
    resolveChannelName,
    devMode,
  } = deps;
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

  const USERS_PER_PAGE = 20;

  function parseUsersQuery(c: any) {
    const page = Math.max(1, Number(c.req.query("page")) || 1);
    const q = (c.req.query("q") as string) || "";
    return { page, q };
  }

  adminRoutes.get("/admin/users", async (c) => {
    const { sub: userId, name: displayName } = c.get("jwtPayload");
    const avatarUrl = c.get("avatarUrl");
    const locale = getLocale(c);
    const theme = getTheme(c);
    const { page, q } = parseUsersQuery(c);
    const result = await userService.listUsersPaginated({
      page,
      perPage: USERS_PER_PAGE,
      query: q || undefined,
    });
    const isHtmx = c.req.header("HX-Request") && !c.req.header("HX-Boosted");
    if (isHtmx) {
      return c.html(
        <AdminUsersListInner
          users={result.users}
          currentUserId={userId}
          locale={locale}
          page={result.page}
          totalPages={Math.max(1, Math.ceil(result.total / result.perPage))}
          query={q}
        />,
      );
    }
    return c.html(
      <AdminUsersPage
        users={result.users}
        currentUserId={userId}
        displayName={displayName}
        avatarUrl={avatarUrl}
        locale={locale}
        theme={theme}
        devMode={devMode}
        page={result.page}
        totalPages={Math.max(1, Math.ceil(result.total / result.perPage))}
        query={q}
      />,
    );
  });

  adminRoutes.post("/admin/users/:id/promote", async (c) => {
    const targetId = c.req.param("id");
    const { sub: userId } = c.get("jwtPayload");
    const locale = getLocale(c);
    const { page, q } = parseUsersQuery(c);

    const target = await userService.findUserById(targetId);
    if (!target) return c.text("Not found", 404);

    await userService.setUserRole(targetId, "admin");

    const result = await userService.listUsersPaginated({
      page,
      perPage: USERS_PER_PAGE,
      query: q || undefined,
    });
    return c.html(
      <AdminUsersListInner
        users={result.users}
        currentUserId={userId}
        locale={locale}
        page={result.page}
        totalPages={Math.max(1, Math.ceil(result.total / result.perPage))}
        query={q}
      />,
    );
  });

  adminRoutes.post("/admin/users/:id/demote", async (c) => {
    const targetId = c.req.param("id");
    const { sub: userId } = c.get("jwtPayload");
    const locale = getLocale(c);
    const { page, q } = parseUsersQuery(c);

    const target = await userService.findUserById(targetId);
    if (!target) return c.text("Not found", 404);

    // Ensure at least one admin remains after the demotion. This also
    // protects the lone admin from removing themselves.
    const remaining = await userService.countAdminsExcluding(targetId);
    if (remaining < 1) {
      return c.text("At least one admin must remain", 400);
    }

    await userService.setUserRole(targetId, "user");

    const result = await userService.listUsersPaginated({
      page,
      perPage: USERS_PER_PAGE,
      query: q || undefined,
    });
    return c.html(
      <AdminUsersListInner
        users={result.users}
        currentUserId={userId}
        locale={locale}
        page={result.page}
        totalPages={Math.max(1, Math.ceil(result.total / result.perPage))}
        query={q}
      />,
    );
  });

  adminRoutes.post("/admin/users/:id/deactivate", async (c) => {
    const targetId = c.req.param("id");
    const { sub: userId } = c.get("jwtPayload");
    const locale = getLocale(c);
    const { page, q } = parseUsersQuery(c);

    const target = await userService.findUserById(targetId);
    if (!target) return c.text("Not found", 404);

    // Cannot deactivate yourself
    if (targetId === userId) return c.text("Cannot deactivate yourself", 400);

    await userService.deactivateUser(targetId);

    const result = await userService.listUsersPaginated({
      page,
      perPage: USERS_PER_PAGE,
      query: q || undefined,
    });
    return c.html(
      <AdminUsersListInner
        users={result.users}
        currentUserId={userId}
        locale={locale}
        page={result.page}
        totalPages={Math.max(1, Math.ceil(result.total / result.perPage))}
        query={q}
      />,
    );
  });

  adminRoutes.post("/admin/users/:id/reactivate", async (c) => {
    const targetId = c.req.param("id");
    const { sub: userId } = c.get("jwtPayload");
    const locale = getLocale(c);
    const { page, q } = parseUsersQuery(c);

    const target = await userService.findUserById(targetId);
    if (!target) return c.text("Not found", 404);

    await userService.reactivateUser(targetId);

    const result = await userService.listUsersPaginated({
      page,
      perPage: USERS_PER_PAGE,
      query: q || undefined,
    });
    return c.html(
      <AdminUsersListInner
        users={result.users}
        currentUserId={userId}
        locale={locale}
        page={result.page}
        totalPages={Math.max(1, Math.ceil(result.total / result.perPage))}
        query={q}
      />,
    );
  });

  async function resolveChannelNames(
    channels: { slackChannelId: string }[],
  ): Promise<Record<string, string>> {
    const names: Record<string, string> = {};
    await Promise.all(
      channels.map(async (ch) => {
        const name = await resolveChannelName(ch.slackChannelId);
        if (name) names[ch.slackChannelId] = name;
      }),
    );
    return names;
  }

  // Snippet channel management
  adminRoutes.get("/admin/snippet-channels", async (c) => {
    const { name: displayName } = c.get("jwtPayload");
    const avatarUrl = c.get("avatarUrl");
    const locale = getLocale(c);
    const theme = getTheme(c);
    const channels = await snippetService.listSnippetChannels();
    const channelNames = await resolveChannelNames(channels);
    return c.html(
      <AdminSnippetChannelsPage
        channels={channels}
        channelNames={channelNames}
        displayName={displayName}
        avatarUrl={avatarUrl}
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
    const channelNames = await resolveChannelNames(channels);
    return c.html(
      <AdminSnippetChannelsList channels={channels} channelNames={channelNames} locale={locale} />,
    );
  });

  adminRoutes.delete("/admin/snippet-channels/:id", async (c) => {
    const id = c.req.param("id");
    const locale = getLocale(c);

    await snippetService.removeSnippetChannel(id);
    const channels = await snippetService.listSnippetChannels();
    const channelNames = await resolveChannelNames(channels);
    return c.html(
      <AdminSnippetChannelsList channels={channels} channelNames={channelNames} locale={locale} />,
    );
  });

  // Kudos channel management
  adminRoutes.get("/admin/kudos-channels", async (c) => {
    const { name: displayName } = c.get("jwtPayload");
    const avatarUrl = c.get("avatarUrl");
    const locale = getLocale(c);
    const theme = getTheme(c);
    const channels = await kudosService.listKudosChannels();
    const channelNames = await resolveChannelNames(channels);
    return c.html(
      <AdminKudosChannelsPage
        channels={channels}
        channelNames={channelNames}
        displayName={displayName}
        avatarUrl={avatarUrl}
        locale={locale}
        theme={theme}
        devMode={devMode}
      />,
    );
  });

  adminRoutes.post("/admin/kudos-channels", async (c) => {
    const locale = getLocale(c);
    const body = await c.req.parseBody();
    const slackChannelId = (body.slack_channel_id as string)?.trim();
    if (!slackChannelId) return c.text("Bad Request", 400);

    await kudosService.addKudosChannel(slackChannelId);
    const channels = await kudosService.listKudosChannels();
    const channelNames = await resolveChannelNames(channels);
    return c.html(
      <AdminKudosChannelsList channels={channels} channelNames={channelNames} locale={locale} />,
    );
  });

  adminRoutes.delete("/admin/kudos-channels/:id", async (c) => {
    const id = c.req.param("id");
    const locale = getLocale(c);

    await kudosService.removeKudosChannel(id);
    const channels = await kudosService.listKudosChannels();
    const channelNames = await resolveChannelNames(channels);
    return c.html(
      <AdminKudosChannelsList channels={channels} channelNames={channelNames} locale={locale} />,
    );
  });

  // Settings management
  adminRoutes.get("/admin/settings", async (c) => {
    const { name: displayName } = c.get("jwtPayload");
    const avatarUrl = c.get("avatarUrl");
    const locale = getLocale(c);
    const theme = getTheme(c);
    const fiscalQuarterStartMonth = await settingsService.getFiscalQuarterStartMonth();
    const fiscalYearLabel = await settingsService.getFiscalYearLabel();
    return c.html(
      <AdminSettingsPage
        fiscalQuarterStartMonth={fiscalQuarterStartMonth}
        fiscalYearLabel={fiscalYearLabel}
        displayName={displayName}
        avatarUrl={avatarUrl}
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
    const yearLabel = String(body.fiscal_year_label);
    if (yearLabel === "start" || yearLabel === "end") {
      await settingsService.setFiscalYearLabel(yearLabel);
    }
    const fiscalQuarterStartMonth = await settingsService.getFiscalQuarterStartMonth();
    const fiscalYearLabel = await settingsService.getFiscalYearLabel();
    return c.html(
      <AdminSettingsForm
        fiscalQuarterStartMonth={fiscalQuarterStartMonth}
        fiscalYearLabel={fiscalYearLabel}
        locale={locale}
      />,
    );
  });

  return adminRoutes;
}
