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
