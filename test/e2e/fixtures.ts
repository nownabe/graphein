import { test as base, expect, type Page } from "@playwright/test";
import { authenticateContext } from "./helpers/auth";

export { expect };

/**
 * Custom Playwright fixtures for Graphein E2E tests.
 *
 * - `authedPage`: A page with a valid JWT session cookie already set.
 *    Use this for tests that need to interact with the Graphein web UI.
 */
export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ context }, use) => {
    await authenticateContext(context);
    const page = await context.newPage();
    await use(page);
  },
});
