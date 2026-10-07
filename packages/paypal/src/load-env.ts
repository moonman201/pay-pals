/**
 * Loads the repo root .env.local into process.env when it exists. Values
 * already set in the environment win. Never logs values.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, "..", "..", "..");
export const ENV_LOCAL_PATH = resolve(REPO_ROOT, ".env.local");

export function loadEnvLocal(path: string = ENV_LOCAL_PATH): boolean {
  if (!existsSync(path)) return false;
  const before = { ...process.env };
  process.loadEnvFile(path);
  // process.loadEnvFile overrides nothing that was already set, but be explicit.
  for (const [k, v] of Object.entries(before)) if (v !== undefined) process.env[k] = v;
  return true;
}
