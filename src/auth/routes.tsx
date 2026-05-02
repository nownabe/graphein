import { Hono } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import type { SessionHelpers } from "./session";
import type { UserService } from "../users/service";
import { LoginPage } from "../views/pages/login";

export interface AuthRoutesConfig {
  baseUrl: string;
  slackClientId: string;
  slackClientSecret: string;
  slackTeamId: string;
}

export function createAuthRoutes(
  config: AuthRoutesConfig,
  session: SessionHelpers,
  userService: UserService,
  devMode: boolean,
) {
  const auth = new Hono();

  auth.get("/login", (c) => {
    const locale = getCookie(c, "locale") === "ja" ? "ja" : "en";
    const theme = getCookie(c, "theme") === "light" ? "light" : "dark";
    return c.html(<LoginPage locale={locale} theme={theme} devMode={devMode} />);
  });

  auth.get("/slack", (c) => {
    const state = crypto.randomUUID();
    const isSecure = config.baseUrl.startsWith("https");
    setCookie(c, "oauth_state", state, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "Lax",
      path: "/auth/slack/callback",
      maxAge: 600, // 10 minutes
    });

    // Persist return_to so the callback can resume the original flow
    const returnTo = c.req.query("return_to");
    if (returnTo) {
      try {
        const url = new URL(returnTo, config.baseUrl);
        if (url.origin === new URL(config.baseUrl).origin) {
          setCookie(c, "return_to", url.pathname + url.search, {
            httpOnly: true,
            secure: isSecure,
            sameSite: "Lax",
            path: "/auth/slack/callback",
            maxAge: 600,
          });
        }
      } catch {
        // Invalid URL — ignore
      }
    }

    const params = new URLSearchParams({
      client_id: config.slackClientId,
      redirect_uri: `${config.baseUrl}/auth/slack/callback`,
      scope: "openid,email,profile",
      response_type: "code",
      state,
    });
    return c.redirect(`https://slack.com/openid/connect/authorize?${params.toString()}`);
  });

  auth.get("/slack/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const storedState = getCookie(c, "oauth_state");
    deleteCookie(c, "oauth_state", { path: "/auth/slack/callback" });

    if (!code || !state || !storedState || state !== storedState) {
      return c.redirect("/auth/login");
    }

    // Exchange code for token
    const tokenRes = await fetch("https://slack.com/api/openid.connect.token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.slackClientId,
        client_secret: config.slackClientSecret,
        code,
        redirect_uri: `${config.baseUrl}/auth/slack/callback`,
      }),
    });
    const tokenData = (await tokenRes.json()) as {
      ok: boolean;
      access_token?: string;
    };
    if (!tokenData.ok || !tokenData.access_token) {
      return c.redirect("/auth/login");
    }

    // Get user info
    const userRes = await fetch("https://slack.com/api/openid.connect.userInfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = (await userRes.json()) as {
      ok: boolean;
      sub?: string;
      email?: string;
      name?: string;
      picture?: string;
      "https://slack.com/team_id"?: string;
    };
    if (!userData.ok || !userData.sub || !userData.email) {
      return c.redirect("/auth/login");
    }

    // Enforce workspace boundary: reject logins from unexpected Slack workspaces
    if (userData["https://slack.com/team_id"] !== config.slackTeamId) {
      return c.redirect("/auth/login");
    }

    // Upsert user
    const user = await userService.findOrCreateUser({
      slackUserId: userData.sub,
      email: userData.email,
      displayName: userData.name ?? userData.email,
      avatarUrl: userData.picture ?? null,
    });

    // Create JWT and set cookie
    const token = await session.createToken(user.id, user.displayName);
    setCookie(c, "token", token, {
      httpOnly: true,
      secure: config.baseUrl.startsWith("https"),
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    // Restore locale preference from DB
    setCookie(c, "locale", user.locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "Lax",
    });

    // Restore theme preference from DB
    setCookie(c, "theme", user.theme, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "Lax",
    });

    // Resume the pre-login flow if return_to was set
    const returnTo = getCookie(c, "return_to");
    deleteCookie(c, "return_to", { path: "/auth/slack/callback" });
    if (returnTo?.startsWith("/")) {
      return c.redirect(returnTo);
    }

    return c.redirect("/tasks");
  });

  auth.post("/logout", (c) => {
    deleteCookie(c, "token", { path: "/" });
    c.header("HX-Redirect", "/auth/login");
    return c.body(null, 200);
  });

  return auth;
}
