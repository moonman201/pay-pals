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
 * phone-width spec only. *.real.spec.ts files are ignored here; they run
 * under playwright.real.config.ts (`npm run e2e:real -w tests/e2e`).
 */
import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, E2E_SERVER_ENV, PORT, REPO_ROOT, STARTS_SERVER } from "./src/env";

const PHONE = /phone-width\.spec\.ts$/;
/** Real-mode specs run only under playwright.real.config.ts. */
const REAL = /\.real\.spec\.ts$/;

export default defineConfig({
  testDir: "./src",
  testMatch: /.*\.spec\.ts/,
  testIgnore: REAL,
  // One dev server serves every worker; it compiles each route on first hit, so the warm-up pays those
  // compiles once and three workers keep the rest from piling up.
  globalSetup: "./src/global-setup.ts",
  workers: 3,
  // A whole scenario, with the dev server compiling routes as it goes; each step keeps its own shorter wait.
  timeout: 300_000,
  expect: {
    timeout: 15_000,
    // visual.spec.ts: a restyle is a deliberate baseline refresh; a font hint or an antialias wobble is not a failure.
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: "disabled", caret: "hide" },
  },
  snapshotPathTemplate: "{testDir}/../__screenshots__/{testFileName}/{arg}{ext}",
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: [PHONE, REAL] },
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
        // Demo-only mode, on a pinned environment: memory store, rules-only
        // pals, fixture prices and the mock gateway, and nothing a checkout's
        // .env.local carries. The suite never spends Claude or PayPal calls,
        // and it renders the same pages in every checkout. A real-mode run is
        // a manual job against a server you start yourself, through E2E_BASE_URL.
        env: E2E_SERVER_ENV,
      }
    : undefined,
});
