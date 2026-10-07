/**
 * Loads .env.local from the repo root into process.env for the real-API
 * tests, without adding a dotenv dependency. Keys already set win.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = join(here, "..", "..", "..", "..", ".env.local");

export function loadEnvLocal(): void {
  if (!existsSync(ENV_FILE)) return;
  for (const raw of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    const value = line.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (!(key in process.env)) process.env[key] = value;
  }
}

/** True when the key is set and SKIP_REAL_TESTS is not, so a key in the shell does not force paid calls on every run. */
export function hasKey(name: string): boolean {
  loadEnvLocal();
  if (process.env.SKIP_REAL_TESTS) return false;
  return typeof process.env[name] === "string" && process.env[name]!.length > 0;
}
