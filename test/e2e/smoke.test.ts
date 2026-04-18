import { test, expect } from "@playwright/test";

test("smoke: Graphein login page is reachable", async ({ page }) => {
  const response = await page.goto("/auth/login");
  expect(response?.status()).toBe(200);
});
