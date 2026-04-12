import { Hono } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { env } from "../env";
import { createToken } from "./session";
import { findOrCreateUser } from "../users/service";
import { LoginPage } from "../views/pages/login";

const auth = new Hono();

auth.get("/login", (c) => {
  const locale = getCookie(c, "locale") === "ja" ? "ja" : "en";
  const theme = getCookie(c, "theme") === "light" ? "light" : "dark";
  return c.html(<LoginPage locale={locale} theme={theme} />);
});

auth.get("/slack", (c) => {
  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    redirect_uri: `${env.BASE_URL}/auth/slack/callback`,
    scope: "openid,email,profile",
    response_type: "code",
  });
  return c.redirect(`https://slack.com/openid/connect/authorize?${params.toString()}`);
});

auth.get("/slack/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) {
    return c.redirect("/auth/login");
  }

  // Exchange code for token
  const tokenRes = await fetch("https://slack.com/api/openid.connect.token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: `${env.BASE_URL}/auth/slack/callback`,
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
  };
  if (!userData.ok || !userData.sub || !userData.email) {
    return c.redirect("/auth/login");
  }

  // Upsert user
  const user = await findOrCreateUser({
    slackUserId: userData.sub,
    email: userData.email,
    displayName: userData.name ?? userData.email,
    avatarUrl: userData.picture ?? null,
  });

  // Create JWT and set cookie
  const token = await createToken(user.id, user.displayName);
  setCookie(c, "token", token, {
    httpOnly: true,
    secure: env.BASE_URL.startsWith("https"),
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

  return c.redirect("/tasks");
});

auth.get("/logout", (c) => {
  deleteCookie(c, "token", { path: "/" });
  return c.redirect("/auth/login");
});

export default auth;
