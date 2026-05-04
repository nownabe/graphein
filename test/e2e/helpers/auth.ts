import { sign } from "hono/jwt";
import type { BrowserContext } from "@playwright/test";
import { env } from "./env";
import { findUserBySlackId } from "./db";

/**
 * Create a JWT token for the given user ID and display name.
 * Uses the same signing logic as the app's session helpers.
 */
export async function createJwtToken(userId: string, displayName: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24; // 1 day for tests
  return sign({ sub: userId, name: displayName, typ: "session", exp }, env.jwtSecret);
}

/**
 * Authenticate a Playwright browser context by setting the JWT cookie.
 * Looks up the test user in the DB by Slack user ID and creates a valid session token.
 *
 * Call this before navigating to protected pages.
 */
export async function authenticateContext(context: BrowserContext): Promise<void> {
  const user = await findUserBySlackId(env.slackUserId);
  if (!user) {
    throw new Error(
      `E2E test user not found in DB for Slack ID: ${env.slackUserId}. ` +
        "Make sure the dev server has processed at least one event from this user.",
    );
  }

  const token = await createJwtToken(user.id as string, user.display_name as string);
  const url = new URL(env.grapheinUrl);

  await context.addCookies([
    {
      name: "token",
      value: token,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "locale",
      value: (user.locale as string) ?? "en",
      domain: url.hostname,
      path: "/",
      sameSite: "Lax",
    },
  ]);
}
