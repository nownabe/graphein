import { test as base, expect } from "@playwright/test";
import { authenticateContext } from "./helpers/auth";

export { expect };

/**
 * Custom Playwright fixtures for Graphein E2E tests.
 *
 * - `authedPage`: A page with a valid JWT session cookie already set.
 *    Use this for tests that need to interact with the Graphein web UI.
 */
export const test = base.extend<{ authedPage: Awaited<ReturnType<(typeof base)["page"]>> }>({
  authedPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    await authenticateContext(context);
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});
