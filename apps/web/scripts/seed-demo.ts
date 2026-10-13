/**
 * Writes the three finished demo deals into DATABASE_URL, once, after a deploy.
 *
 * This is the only thing that seeds a hosted database. The app itself never
 * does: a cold start that replayed the fixtures with real model calls once
 * kept the first visitor waiting 119 s.
 *
 *   npm run demo:seed -w apps/web -- --base https://pay-pals-m00n1.vercel.app
 *
 * Idempotent: a scenario that already has a current-version seed is skipped.
 * A stale seed is reported and left alone; the sweep removes it first
 * (npm run db:delete-seeded-demo-deals -w packages/db -- --sweep --keep-seed none --yes).
 * Uses the real pals when ANTHROPIC_API_KEY is set. Photo URLs are resolved
 * against --base, else NEXT_PUBLIC_APP_URL, so vision reads fetch real files.
 * Prints each deal id and the time it took. Exits non-zero on any failure.
 * Secrets come from .env.local and are never printed.
 */
import { createPostgresDealStore, createReplayClock } from "@pay-pals/db";
import { asDealFinder } from "../lib/demo/seed-fixtures";
import { formatSeedLine, parseSeedArgs, runSeed, seedExitCode } from "../lib/demo/seed-cli";
import { createServices, isDemoOnly } from "../lib/services";
import { loadRootEnvLocal } from "../lib/env";

async function main(): Promise<number> {
  const parsed = parseSeedArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.message);
    return 2;
  }
  // The test knob must come from the real environment, as in the app, so a file cannot turn it off.
  if (isDemoOnly(process.env)) {
    console.error("PAY_PALS_DEMO_ONLY is set: that mode uses a memory store, so there is nothing to seed. Unset it.");
    return 2;
  }
  if (parsed.args.base) process.env.NEXT_PUBLIC_APP_URL = parsed.args.base;
  loadRootEnvLocal();
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is not set. Add it to .env.local (see .env.example).");
    return 2;
  }
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const claude = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  if (!base && claude) {
    console.error("The pals will read photos, and a relative photo URL cannot be fetched. Pass --base <production URL> or set NEXT_PUBLIC_APP_URL.");
    return 2;
  }
  console.log(`[seed] photo base: ${base ? "set" : "not set (rules only, no photo reads)"}; pals: ${claude ? "Claude on" : "rules only (ANTHROPIC_API_KEY not set)"}`);

  const services = createServices(process.env, (line) => console.log(line));
  const replay = createReplayClock();
  const seedingStore = createPostgresDealStore(url, { clock: replay.clock });
  await seedingStore.migrate();
  const finder = asDealFinder(seedingStore);
  if (!finder) {
    console.error("This store cannot look deals up by scenario, so it cannot seed idempotently.");
    return 1;
  }
  const lines = await runSeed({ ...services, store: seedingStore, clock: replay.clock }, finder, parsed.args.only, (line) => console.log(line), replay);
  for (const line of lines) console.log(`[seed] ${formatSeedLine(line)}`);
  const code = seedExitCode(lines);
  console.log(code === 0 ? "[seed] done" : "[seed] finished with problems");
  return code;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(`[seed] could not complete: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
