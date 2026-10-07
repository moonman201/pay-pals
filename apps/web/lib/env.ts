/**
 * Next.js only reads .env files from apps/web. The repo keeps secrets in
 * .env.local at the checkout root, so the server loads every candidate it
 * can find: the app's own file and the root file. Keys already in the
 * environment win, so a key Next loaded from apps/web/.env.local, or one set
 * in the shell, is never overwritten by the root file. NEXT_PUBLIC_* values
 * are inlined at build time and must come from apps/web/.env.local or the
 * host's environment; this loader cannot help the browser bundle.
 *
 * Values may contain quotes and other shell characters. This parser never
 * shells out; do not `source` these files in docs or scripts.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Relative to the server's working directory: the app's file first, then the repo root's. */
export const ENV_CANDIDATES = [".env.local", "../../.env.local"] as const;

export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    const value = line.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (key) out[key] = value;
  }
  return out;
}

/** Loads every candidate file that exists. Returns the files applied, in order. */
export type EnvMap = Record<string, string | undefined>;

export function loadRootEnvLocal(env: EnvMap = process.env, cwd = process.cwd()): string[] {
  const applied: string[] = [];
  for (const candidate of ENV_CANDIDATES) {
    const file = path.resolve(cwd, candidate);
    if (!existsSync(file)) continue;
    for (const [key, value] of Object.entries(parseEnvFile(readFileSync(file, "utf8")))) {
      if (!(key in env) || env[key] === "") env[key] = value;
    }
    applied.push(file);
  }
  return applied;
}
