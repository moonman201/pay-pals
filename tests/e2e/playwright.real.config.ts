/**
 * Real-mode Playwright run: the PayPal JS SDK v6 buttons in a browser against
 * the PayPal sandbox, with the real pals. Spends Claude, Channel3 and PayPal
 * sandbox calls, so it is kept out of the default suite and the root gate.
 *
 * Run from the repo root:
 *   npm run e2e:real -w tests/e2e
 *
 * It builds apps/web first (NEXT_PUBLIC_PAYPAL_CLIENT_ID is inlined at build
 * time, from apps/web/.env.local), then starts `next start` on port 3200 with
 * the real environment from the root .env.local. Needs, in .env.local:
 * PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, NEXT_PUBLIC_PAYPAL_CLIENT_ID (also
 * in apps/web/.env.local), SANDBOX_BUYER_EMAIL and SANDBOX_BUYER_PASSWORD.
 * Only *.real.spec.ts files run here; the default config ignores them.
 *
 * It starts its own server and reuses nothing unless `E2E_REUSE_SERVER=1`
 * says so. This config used to reuse whatever was listening on the port
 * without asking, which also skipped the build, so a sandbox run could spend
 * real calls against an old compile and say nothing about it. The first line
 * of the run now names the server and whether this run started it.
 */
import { defineConfig, devices } from "@playwright/test";
import { REPO_ROOT } from "./src/env";
import { REAL_BASE_URL, REAL_HEADED, REAL_PORT, REAL_SKIP_BUILD, REAL_STARTS_SERVER } from "./src/real-env";
import { REUSE_SERVER } from "./src/server-mode";

const start = `npm run start -w apps/web -- --port ${REAL_PORT}`;
const command = REAL_SKIP_BUILD ? start : `npm run build -w apps/web && ${start}`;

export default defineConfig({
  testDir: "./src",
  testMatch: /.*\.real\.spec\.ts/,
  globalSetup: "./src/real-global-setup.ts",
  // Real Claude review, a sandbox login and a capture, one after another.
  timeout: 360_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: REAL_BASE_URL,
    headless: !REAL_HEADED,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "real", use: { ...devices["Desktop Chrome"] } }],
  webServer: REAL_STARTS_SERVER
    ? {
        command,
        cwd: REPO_ROOT,
        url: REAL_BASE_URL,
        // Opt-in only. Reusing a server here also skips the build above, so a run could
        // spend sandbox and Claude calls proving something about an old compile.
        reuseExistingServer: REUSE_SERVER,
        // Production build plus start.
        timeout: 420_000,
        env: process.env as Record<string, string>,
      }
    : undefined,
});
