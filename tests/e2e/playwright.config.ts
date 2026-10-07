/**
 * Playwright e2e for the three demo scenarios.
 *
 * Not part of the root `npm test`. Run from the repo root:
 *   npm run e2e:install -w tests/e2e   (once, downloads Chromium)
 *   npm run test:e2e
 *
 * Starts apps/web on PORT when it is present on the branch. Set E2E_BASE_URL
 * to point at a server that is already running instead. Two projects: a
 * desktop Chrome run of every scenario, and a 390 px phone run of the
 * phone-width spec only.
 */
import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, PORT, REPO_ROOT, STARTS_SERVER } from "./src/env";

const PHONE = /phone-width\.spec\.ts$/;

export default defineConfig({
  testDir: "./src",
  testMatch: /.*\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: PHONE },
    {
      name: "phone",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
      testMatch: PHONE,
    },
  ],
  webServer: STARTS_SERVER
    ? {
        command: `npm run dev -w apps/web -- --port ${PORT}`,
        cwd: REPO_ROOT,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        // Demo-only mode: memory store, rules-only pals, fixture prices and the
        // mock gateway, whatever keys the shell or .env.local carry. The suite
        // never spends Claude or PayPal calls. A real-mode run is a manual job
        // against a server you start yourself, through E2E_BASE_URL.
        env: { ...process.env, PAY_PALS_DEMO_ONLY: "1" },
      }
    : undefined,
});
