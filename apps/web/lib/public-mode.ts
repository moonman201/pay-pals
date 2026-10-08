/**
 * Public mode: the pals drop the "this photo could not be loaded" sentences.
 * On until Matt's demo photos exist. Nothing about what the pals decide
 * changes; see packages/agents presentation.ts.
 *
 * On when PAY_PALS_PUBLIC_MODE is 1 or true, or when the app runs on Vercel
 * (VERCEL is set) and public/fixtures/clean-ps5 holds no files, so the
 * hosted site needs no extra variable. Off otherwise, including in tests.
 */
import { readdirSync } from "node:fs";
import path from "node:path";

type Env = Record<string, string | undefined>;

export const PHOTO_PROBE_DIR = path.join("fixtures", "clean-ps5");

function hasFiles(dir: string): boolean {
  try {
    return readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

export function isPublicMode(env: Env, publicDir: string): boolean {
  const value = env.PAY_PALS_PUBLIC_MODE?.trim().toLowerCase();
  if (value === "1" || value === "true") return true;
  if (env.VERCEL?.trim()) return !hasFiles(path.join(publicDir, PHOTO_PROBE_DIR));
  return false;
}

export function publicModeLine(on: boolean, env: Env): string {
  if (!on) return "[pay-pals] public mode: off, pals say when a photo could not be loaded";
  const why = env.PAY_PALS_PUBLIC_MODE?.trim() ? "PAY_PALS_PUBLIC_MODE" : "Vercel with no demo photos under public/fixtures/clean-ps5";
  return `[pay-pals] public mode: on (${why}), pals do not mention photo loading`;
}
