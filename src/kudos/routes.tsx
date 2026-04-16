import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";
import type { KudosService } from "./service";
import type { SettingsService } from "../settings/service";
import type { BuildMrkdwnLabels } from "../config";
import {
  computePeriod,
  navigatePeriod,
  formatPeriodLabel,
  parseDateInTimezone,
  formatDateInTimezone,
  type PeriodType,
} from "../snippets/period";
import { KudosPage, KudosContentPartial } from "../views/pages/kudos";

export interface KudosRoutesDeps {
  authMiddleware: MiddlewareHandler;
  kudosService: KudosService;
  settingsService: SettingsService;
  buildMrkdwnLabels: BuildMrkdwnLabels;
  timezone: string;
  devMode: boolean;
}

const VALID_PERIODS = new Set<PeriodType>(["day", "week", "month", "quarter", "year"]);

export function createKudosRoutes(deps: KudosRoutesDeps) {
  const { authMiddleware, kudosService, settingsService, buildMrkdwnLabels, timezone, devMode } =
    deps;
  const kudosRoutes = new Hono();

  kudosRoutes.use("*", authMiddleware);

  function getLocale(c: { req: { raw: Request } }): string {
    const cookie = getCookie(c as any, "locale");
    return cookie === "ja" ? "ja" : "en";
  }

  function getTheme(c: { req: { raw: Request } }): string {
    const cookie = getCookie(c as any, "theme");
    return cookie === "light" ? "light" : "dark";
  }

  kudosRoutes.get("/kudos", async (c) => {
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
      return c.redirect("/kudos");
    }

    const pageParam = Number(c.req.query("page") ?? "1");
    const page = pageParam > 0 ? pageParam : 1;
    const perPage = 50;

    const postedByParam = c.req.query("postedBy");
    const userParam = c.req.query("user");

    const hasAnyFilterParam = postedByParam !== undefined || userParam !== undefined;

    // Default: pre-select current user as mentioned user filter
    const { sub: currentUserId } = c.get("jwtPayload");
    const activeMentionedUser = hasAnyFilterParam ? userParam || undefined : currentUserId;

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

    const { entries, total } = await kudosService.listKudosEntries({
      postedById: postedByParam || undefined,
      mentionedUserId: activeMentionedUser,
      periodStart,
      periodEnd,
      limit: perPage,
      offset: (page - 1) * perPage,
    });

    const totalPages = Math.max(1, Math.ceil(total / perPage));

    // Collect all entry messages for mrkdwn label resolution
    const allMessages = entries.map((e) => e.message);
    const mrkdwnLabels = await buildMrkdwnLabels(allMessages);

    // Load filter options
    const [posters, mentionedUsers] = await Promise.all([
      kudosService.getDistinctKudosPosters(),
      kudosService.getDistinctMentionedUsers(),
    ]);

    const posterOptions = posters.map((p) => ({ id: p.id, label: p.displayName }));
    const mentionedUserOptions = mentionedUsers.map((u) => ({
      id: u.id,
      label: u.displayName,
    }));

    const contentProps = {
      entries,
      total,
      locale,
      period,
      periodLabel,
      prevDate,
      nextDate,
      currentDate,
      posters: posterOptions,
      mentionedUsers: mentionedUserOptions,
      activePostedBy: postedByParam || undefined,
      activeMentionedUser,
      page,
      totalPages,
      mrkdwnLabels,
      isNextDisabled,
    };

    if (c.req.header("HX-Request") && !c.req.header("HX-Boosted")) {
      return c.html(<KudosContentPartial {...contentProps} />);
    }

    return c.html(
      <KudosPage
        {...contentProps}
        displayName={displayName}
        avatarUrl={avatarUrl}
        theme={theme}
        isAdmin={isAdmin}
        devMode={devMode}
      />,
    );
  });

  return kudosRoutes;
}
