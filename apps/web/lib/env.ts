/**
 * Next.js only reads .env files from apps/web. The repo keeps secrets in
 * .env.local at the checkout root, so the server loads that file too, for
 * server-side keys. Keys already in the environment win. NEXT_PUBLIC_*
 * values are inlined at build time and must come from apps/web/.env.local
 * or the host's environment; this loader cannot help the browser bundle.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const CANDIDATES = [".env.local", "../../.env.local"];

export function loadRootEnvLocal(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string | null {
  const file = CANDIDATES.map((c) => path.resolve(cwd, c)).find((p) => existsSync(p));
  if (!file) return null;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    const value = line.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (!(key in env) || env[key] === "") env[key] = value;
  }
  return file;
}
