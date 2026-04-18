import { defineConfig } from "@playwright/test";

export default defineConfig({
  globalSetup: "./test/e2e/global-setup.ts",
  testDir: "./test/e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_GRAPHEIN_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
