import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";
import type { SnippetService } from "./service";
import type { UserService } from "../users/service";
import type { SettingsService } from "../settings/service";
import type { BuildMrkdwnLabels } from "../config";
import {
  computePeriod,
  navigatePeriod,
  formatPeriodLabel,
  parseDateInTimezone,
  formatDateInTimezone,
  type PeriodType,
} from "./period";
import { SnippetsPage, SnippetsContentPartial } from "../views/pages/snippets";

export interface SnippetRoutesDeps {
  authMiddleware: MiddlewareHandler;
  snippetService: SnippetService;
  userService: UserService;
  settingsService: SettingsService;
  buildMrkdwnLabels: BuildMrkdwnLabels;
  timezone: string;
  devMode: boolean;
}

const VALID_PERIODS = new Set<PeriodType>(["day", "week", "month", "quarter", "year"]);

export function createSnippetRoutes(deps: SnippetRoutesDeps) {
  const {
    authMiddleware,
    snippetService,
    userService,
    settingsService,
    buildMrkdwnLabels,
    timezone,
    devMode,
  } = deps;
  const snippetRoutes = new Hono();

  snippetRoutes.use("*", authMiddleware);

  function getLocale(c: { req: { raw: Request } }): string {
    const cookie = getCookie(c as any, "locale");
    return cookie === "ja" ? "ja" : "en";
  }

  function getTheme(c: { req: { raw: Request } }): string {
    const cookie = getCookie(c as any, "theme");
    return cookie === "light" ? "light" : "dark";
  }

  snippetRoutes.get("/snippets", async (c) => {
    const { name: displayName } = c.get("jwtPayload");
    const isAdmin = c.get("isAdmin");
    const avatarUrl = c.get("avatarUrl");
    const locale = getLocale(c);
    const theme = getTheme(c);

    const periodParam = c.req.query("period") ?? "week";
    const period: PeriodType = VALID_PERIODS.has(periodParam as PeriodType)
      ? (periodParam as PeriodType)
      : "week";

    const dateParam = c.req.query("date");
    const anchor = dateParam
      ? parseDateInTimezone(dateParam, timezone)
      : navigatePeriod(period, new Date(), timezone, "prev");
    if (isNaN(anchor.getTime())) {
      return c.redirect("/snippets");
    }

    const pageParam = Number(c.req.query("page") ?? "1");
    const page = pageParam > 0 ? pageParam : 1;
    const perPage = 50;

    const postedByParam = c.req.query("postedBy");
    const userParam = c.req.query("user");
    const usergroupParam = c.req.query("usergroup");

    // Default mentions filter: on initial page load (no filter-related query params),
    // pre-select the current user and their usergroups.
    const { sub: currentUserId } = c.get("jwtPayload");
    const hasAnyFilterParam =
      postedByParam !== undefined || userParam !== undefined || usergroupParam !== undefined;
    let userIds: string[];
    let usergroupIds: string[];
    if (hasAnyFilterParam) {
      userIds = userParam ? userParam.split(",").filter(Boolean) : [];
      usergroupIds = usergroupParam ? usergroupParam.split(",").filter(Boolean) : [];
    } else {
      userIds = [currentUserId];
      usergroupIds = await snippetService.getUsergroupIdsByMember(currentUserId);
    }

    const fiscalQuarterStartMonth = await settingsService.getFiscalQuarterStartMonth();
    const fiscalYearLabel = await settingsService.getFiscalYearLabel();

    const { start: periodStart, end: periodEnd } = computePeriod(
      period,
      anchor,
      timezone,
      fiscalQuarterStartMonth,
    );
    const periodLabel = formatPeriodLabel(
      period,
      { start: periodStart, end: periodEnd },
      timezone,
      locale,
      fiscalQuarterStartMonth,
      fiscalYearLabel,
    );

    const prevAnchor = navigatePeriod(period, anchor, timezone, "prev");
    const nextAnchor = navigatePeriod(period, anchor, timezone, "next");
    const prevDate = formatDateInTimezone(prevAnchor, timezone);
    const nextDate = formatDateInTimezone(nextAnchor, timezone);
    const currentDate = formatDateInTimezone(anchor, timezone);
    const isNextDisabled = periodEnd > new Date();

    const { snippets: snippetList, total } = await snippetService.listSnippets({
      postedById: postedByParam || undefined,
      mentionedUserIds: userIds.length > 0 ? userIds : undefined,
      mentionedUsergroupIds: usergroupIds.length > 0 ? usergroupIds : undefined,
      periodStart,
      periodEnd,
      limit: perPage,
      offset: (page - 1) * perPage,
    });

    const totalPages = Math.max(1, Math.ceil(total / perPage));

    const mrkdwnLabels = await buildMrkdwnLabels(snippetList.map((s) => s.content));

    // Load filter options
    const [posters, mentionedUsergroups] = await Promise.all([
      snippetService.getDistinctPosters(),
      snippetService.getDistinctMentionedUsergroups(),
    ]);

    // For mentioned users filter, use all users (they may be mentioned)
    const allUsers = await userService.listAllUsers();

    const posterOptions = posters.map((p) => ({ id: p.id, label: p.displayName }));
    const mentionedUserOptions = allUsers.map((u) => ({ id: u.id, label: u.displayName }));

    // Merge default-selected usergroups into options if not already present
    const mentionedUsergroupOptions = mentionedUsergroups.map((g) => ({
      id: g.id,
      label: g.handle ? `@${g.handle}` : g.name,
    }));
    if (!hasAnyFilterParam && usergroupIds.length > 0) {
      const existingIds = new Set(mentionedUsergroupOptions.map((o) => o.id));
      const missingIds = usergroupIds.filter((id) => !existingIds.has(id));
      if (missingIds.length > 0) {
        const missingGroups = await snippetService.getUsergroupsByIds(missingIds);
        for (const g of missingGroups) {
          mentionedUsergroupOptions.push({
            id: g.id,
            label: g.handle ? `@${g.handle}` : g.name,
          });
        }
      }
    }

    const contentProps = {
      snippets: snippetList,
      total,
      locale,
      period,
      periodLabel,
      prevDate,
      nextDate,
      currentDate,
      posters: posterOptions,
      mentionedUsers: mentionedUserOptions,
      mentionedUsergroups: mentionedUsergroupOptions,
      activePostedBy: postedByParam || undefined,
      activeMentionedUsers: userIds,
      activeMentionedUsergroups: usergroupIds,
      hasExplicitFilters: hasAnyFilterParam,
      page,
      totalPages,
      mrkdwnLabels,
      isNextDisabled,
    };

    if (c.req.header("HX-Request") && !c.req.header("HX-Boosted")) {
      return c.html(<SnippetsContentPartial {...contentProps} />);
    }

    return c.html(
      <SnippetsPage
        {...contentProps}
        displayName={displayName}
        avatarUrl={avatarUrl}
        theme={theme}
        isAdmin={isAdmin}
        devMode={devMode}
      />,
    );
  });

  return snippetRoutes;
}
