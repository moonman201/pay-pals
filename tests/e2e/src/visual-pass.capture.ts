/**
 * Visual pass, Oct 9: full-page screenshots of the public pages for Matt to
 * compare before and after the new layout. Read-only: it loads pages and
 * nothing else. Run from tests/e2e:
 *
 *   E2E_BASE_URL=https://pay-pals-m00n1.vercel.app npx tsx src/visual-pass.capture.ts before
 *   E2E_BASE_URL=<preview url> npx tsx src/visual-pass.capture.ts after
 *   E2E_BASE_URL=<preview url> npx tsx src/visual-pass.capture.ts after-day light
 *
 * The third argument is the colour mode, night by default. Day is reached
 * by writing the visitor's stored choice before the page loads, which is
 * what a visitor who pressed the toggle once has; the boot script then
 * applies it before the first paint, so there is no flash to catch and no
 * hydration race. It is not reached with Playwright's colorScheme: since
 * G16 nothing in apps/web reads the device, so that setting changes
 * nothing. Setting data-theme directly would work too and would skip the
 * boot script, which is part of what these shots are meant to show working.
 *
 * Writes docs/visual-pass/<set>/<page>-<width>.png. Each file is kept under
 * 400 KB by taking the shot at a smaller device scale when the first one is
 * too big (1, then 0.75, then 0.5).
 */
import { mkdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext } from "@playwright/test";
import { ALL_FIXTURES } from "@pay-pals/contracts";
import { BASE_URL } from "./env";
import { DEAL_ID_IN_URL } from "./layout-helpers";

// The suite's own base: E2E_BASE_URL when set, otherwise this worktree's port. Hard-coding 3100
// stopped being right when each worktree started choosing its own.
const BASE = BASE_URL;
const SET = process.argv[2] ?? "before";
/** "light" for day, anything else for night, which is what every visitor gets until they choose. */
const MODE = process.argv[3] === "light" ? "light" : "dark";
/**
 * apps/web/lib/theme.ts owns this key; tests/e2e cannot import across that
 * boundary, so it is repeated here. A repeated constant can drift, so the
 * shot is not trusted on the strength of it: shootAt reads the attribute
 * the page actually painted and refuses to write a file if it is not the
 * mode asked for. A wrong key gives a loud failure, never a night shot
 * filed as day.
 */
const THEME_STORAGE_KEY = "pay-pals-theme";
/** A comma-separated list of shot names, or every shot when it is not given. */
const ONLY = (process.argv[4] ?? "").split(",").map((n) => n.trim()).filter(Boolean);
const OUT = resolve(process.cwd(), "..", "..", "docs", "visual-pass", SET);
const WIDTHS = [1280, 390] as const;
const LIMIT = 400 * 1024;
const SCALES = [1, 0.75, 0.5] as const;

interface Shot {
  name: string;
  path: string;
}

/**
 * The finished deals the landing page links to, keyed by scenario id. The
 * card is found by the fixture's own name, so renaming a scenario cannot
 * quietly file one deal under another's name.
 */
/** The visitor's stored choice, written before any page script runs, on every page this context opens. */
async function storeMode(context: BrowserContext): Promise<void> {
  if (MODE === "dark") return; // Night needs nothing stored: it is what the server renders.
  await context.addInitScript(
    ([key, mode]) => {
      try {
        window.localStorage.setItem(key, mode);
      } catch {
        // A context with storage blocked still gets night, which is the honest fallback.
      }
    },
    [THEME_STORAGE_KEY, MODE] as const,
  );
}

async function finishedDeals(browser: Browser): Promise<Record<string, string>> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  // Every href first, while the landing is still open: following one navigates away from it.
  const hrefs = new Map<string, string>();
  for (const fixture of ALL_FIXTURES) {
    const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: fixture.name }) });
    const href = await card.getByRole("link", { name: "See the finished deal" }).getAttribute("href");
    if (!href) throw new Error(`No finished deal on the landing page for ${fixture.id} ("${fixture.name}")`);
    hrefs.set(fixture.id, href);
  }

  // Then follow each, rather than read an id out of it. The landing links by scenario now and
  // resolves the deal per request, so the href has no id in it to read; when it did, a capture
  // run after a re-seed would have filed one deal under another's name or shot a dead page.
  const out: Record<string, string> = {};
  for (const [scenario, href] of hrefs) {
    await page.goto(new URL(href, BASE).toString(), { waitUntil: "networkidle" });
    const id = DEAL_ID_IN_URL.exec(page.url())?.[1];
    if (!id) throw new Error(`${scenario}: ${href} did not land on a deal room (${page.url()})`);
    out[scenario] = id;
  }
  await context.close();
  return out;
}

/** One full-page shot at the given width and device scale; returns the file size. */
async function shootAt(browser: Browser, shot: Shot, width: number, scale: number, file: string): Promise<number> {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: scale });
  await storeMode(context);
  const page = await context.newPage();
  await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle" });
  // The mode the page actually painted, not the one asked for: a shot filed under the wrong
  // mode would be worse than no shot, and the boot script is one of the things being checked.
  const painted = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  if (painted !== MODE) throw new Error(`${shot.name} at ${width}px: asked for ${MODE}, the page painted ${painted ?? "nothing"}`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: file, fullPage: true });
  await context.close();
  return statSync(file).size;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const deals = await finishedDeals(browser);
  const shots: Shot[] = [
    { name: "landing", path: "/" },
    ...Object.entries(deals).map(([key, id]) => ({ name: `${key}-room`, path: `/deals/${id}?as=buyer` })),
    ...(["clean-ps5", "empty-box"] as const).filter((k) => deals[k]).map((k) => ({ name: `${k}-evidence`, path: `/deals/${deals[k]}/evidence?as=buyer` })),
  ];
  const wanted = ONLY.length > 0 ? shots.filter((s) => ONLY.includes(s.name)) : shots;
  const missing = ONLY.filter((n) => !shots.some((s) => s.name === n));
  if (missing.length > 0) throw new Error(`No such shot: ${missing.join(", ")}. Available: ${shots.map((s) => s.name).join(", ")}`);
  for (const width of WIDTHS) {
    for (const shot of wanted) {
      const file = resolve(OUT, `${shot.name}-${width}.png`);
      let size = 0;
      let used = 1;
      for (const scale of SCALES) {
        size = await shootAt(browser, shot, width, scale, file);
        used = scale;
        if (size <= LIMIT) break;
      }
      console.log(`${MODE} ${file} ${Math.round(size / 1024)} KB at scale ${used}${size > LIMIT ? " (over the 400 KB budget)" : ""}`);
    }
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
