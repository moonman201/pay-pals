/**
 * Where the web app lives and whether it is present on this branch. The
 * Playwright config and the specs both read this so a branch without
 * apps/web skips the e2e suite instead of failing to start a server.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = resolve(here, "..", "..", "..");
export const WEB_DIR = resolve(REPO_ROOT, "apps", "web");
export const WEB_PRESENT = existsSync(resolve(WEB_DIR, "package.json"));

/** 3100 by default so a dev server already on 3000 is left alone. */
export const PORT = Number(process.env.E2E_PORT ?? 3100);
/** Set E2E_BASE_URL to run against a server you started yourself, or a deployed app. */
export const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
export const STARTS_SERVER = WEB_PRESENT && !process.env.E2E_BASE_URL;

/**
 * A value that reads as "not set" to the app but stops the server's env
 * loader filling it in. apps/web/lib/env.ts copies a key out of a .env.local
 * file when the key is missing or empty, so an empty string is not enough;
 * one space survives that and still trims to nothing everywhere the app
 * looks at it.
 */
const UNSET = " ";

/**
 * The environment the suite's own dev server runs in. Whether a checkout has
 * a .env.local must not change what the pages render: with the sandbox seller
 * account set, demo deals swap the fixture payee for a longer address, which
 * wraps differently and moves every visual baseline. So each key the app reads
 * is given a value here and nothing is inherited that matters.
 *
 * Keys are pinned, not only blanked, so a key added to .env.local later cannot
 * quietly change a run: the sandbox account addresses and the public client id
 * (the payee, the pay panel's test-buyer note, the real PayPal buttons), the
 * Claude, Channel3 and PSA keys (which would make the pals talk to a network),
 * DATABASE_URL (which would take the suite off the memory store), the app URL
 * (photo links) and the public-mode and Vercel switches (the pals' wording).
 */
export const E2E_SERVER_ENV: Record<string, string> = {
  ...(process.env as Record<string, string>),
  PAY_PALS_DEMO_ONLY: "1",
  PAY_PALS_PUBLIC_MODE: "0",
  VERCEL: UNSET,
  SANDBOX_SELLER_PERSONAL_EMAIL: UNSET,
  SANDBOX_SELLER_BUSINESS_EMAIL: UNSET,
  SANDBOX_BUYER_EMAIL: UNSET,
  SANDBOX_BUYER_PASSWORD: UNSET,
  NEXT_PUBLIC_PAYPAL_CLIENT_ID: UNSET,
  NEXT_PUBLIC_APP_URL: UNSET,
  PAYPAL_CLIENT_ID: UNSET,
  PAYPAL_CLIENT_SECRET: UNSET,
  PAYPAL_WEBHOOK_ID: UNSET,
  PAYPAL_ENV: UNSET,
  ANTHROPIC_API_KEY: UNSET,
  CHANNEL3_API_KEY: UNSET,
  PSA_API_TOKEN: UNSET,
  DATABASE_URL: UNSET,
};
