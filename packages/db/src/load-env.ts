/**
 * Loads the repo root .env.local into process.env when it exists, so tests
 * and scripts can find DATABASE_URL. Values already set win. Never logs values.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ENV_LOCAL_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".env.local");

export function loadEnvLocal(path: string = ENV_LOCAL_PATH): boolean {
  if (!existsSync(path)) return false;
  const before = { ...process.env };
  process.loadEnvFile(path);
  for (const [k, v] of Object.entries(before)) if (v !== undefined) process.env[k] = v;
  return true;
}
