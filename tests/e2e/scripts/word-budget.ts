/**
 * Counts the words a visitor can read without clicking anything, and checks them against the
 * design budgets (Matt, Oct 13): the whole landing page at most 250 words, and each finished deal
 * room's first screen at 1280x800, as the buyer, at most 60.
 *
 * What counts as visible is defined in src/word-count.ts, which folds.spec.ts shares.
 *
 *   npm run words -w tests/e2e                     starts its own server on E2E_PORT, as the suite does
 *   E2E_BASE_URL=http://localhost:3000 npm run words -w tests/e2e   uses a server that is already up
 *   WORDS_NO_BUDGET=1 ...                          prints counts and exits 0 (for a "before" run)
 *   WORDS_DUMP=1 ...                               also prints the counted words of each first screen
 */
import { spawn, type ChildProcess } from "node:child_process";
import { chromium } from "@playwright/test";
import { ALL_FIXTURES } from "@pay-pals/contracts";
import { BASE_URL, E2E_SERVER_ENV, PORT, REPO_ROOT, STARTS_SERVER } from "../src/env";
import { LANDING_BUDGET, ROOM_BUDGET, visibleWords } from "../src/word-count";

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(BASE_URL)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`no server answered at ${BASE_URL}`);
}

async function main(): Promise<void> {
  let server: ChildProcess | null = null;
  if (STARTS_SERVER) {
    server = spawn("npm", ["run", "dev", "-w", "apps/web", "--", "--port", String(PORT)], { cwd: REPO_ROOT, env: E2E_SERVER_ENV, stdio: "ignore" });
    await waitForServer();
  }
  const browser = await chromium.launch();
  const failures: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
    const landing = await visibleWords(page, false);
    console.log(`landing, whole page: ${landing.length} words (budget ${LANDING_BUDGET})`);
    if (process.env.WORDS_DUMP) console.log(landing.join(" "));
    if (landing.length > LANDING_BUDGET) failures.push(`landing ${landing.length} > ${LANDING_BUDGET}`);

    for (const f of ALL_FIXTURES) {
      await page.goto(`${BASE_URL}/deals/finished/${f.id}?as=buyer`, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      const w = await visibleWords(page, true);
      console.log(`${f.id}, buyer, first screen 1280x800: ${w.length} words (budget ${ROOM_BUDGET})`);
      if (process.env.WORDS_DUMP) console.log(w.join(" "));
      if (w.length > ROOM_BUDGET) failures.push(`${f.id} ${w.length} > ${ROOM_BUDGET}`);
    }
  } finally {
    await browser.close();
    server?.kill("SIGTERM");
  }
  if (failures.length && !process.env.WORDS_NO_BUDGET) {
    console.error(`over budget: ${failures.join("; ")}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
