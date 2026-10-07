/**
 * Environment for the real-mode run (playwright.real.config.ts). Loads the
 * repo root .env.local into this process so the sandbox buyer credentials
 * reach the spec and the server, without overriding anything the shell set.
 * Values are never logged. The demo-only knob is removed on purpose: this
 * run exists to exercise the real gateway and the real pals.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_ROOT } from "./env";

const ENV_LOCAL = resolve(REPO_ROOT, ".env.local");
if (existsSync(ENV_LOCAL)) process.loadEnvFile(ENV_LOCAL);
delete process.env.PAY_PALS_DEMO_ONLY;

/** 3200 so it never collides with the demo suite on 3100 or a dev server on 3000. */
export const REAL_PORT = Number(process.env.E2E_REAL_PORT ?? 3200);
export const REAL_BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${REAL_PORT}`;
export const REAL_STARTS_SERVER = !process.env.E2E_BASE_URL;
/** Set E2E_REAL_HEADED=1 to watch the run, or when PayPal refuses the headless popup. */
export const REAL_HEADED = process.env.E2E_REAL_HEADED === "1";
/** Set E2E_REAL_SKIP_BUILD=1 to start the last production build instead of rebuilding apps/web. */
export const REAL_SKIP_BUILD = process.env.E2E_REAL_SKIP_BUILD === "1";

/** The sandbox buyer's login, read inside the test, never printed or passed on a command line. */
export function sandboxBuyer(): { email: string; password: string } | null {
  const email = process.env.SANDBOX_BUYER_EMAIL?.trim();
  const password = process.env.SANDBOX_BUYER_PASSWORD;
  return email && password ? { email, password } : null;
}
