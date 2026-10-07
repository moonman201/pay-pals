/**
 * Playwright e2e for the three demo scenarios.
 *
 * Not wired into the root `npm test` yet. Run by hand:
 *   npm run e2e:install -w tests/e2e   (once, downloads Chromium)
 *   npm run e2e -w tests/e2e
 *
 * Starts apps/web on PORT when it is present on the branch. Set E2E_BASE_URL
 * to point at a server that is already running instead.
 */
import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, PORT, REPO_ROOT, STARTS_SERVER } from "./src/env";

export default defineConfig({
  testDir: "./src",
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: STARTS_SERVER
    ? {
        command: `npm run dev -w apps/web -- --port ${PORT}`,
        cwd: REPO_ROOT,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
});
