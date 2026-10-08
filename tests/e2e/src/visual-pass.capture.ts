/**
 * Visual pass, Oct 9: full-page screenshots of the public pages for Matt to
 * compare before and after the new layout. Read-only: it loads pages and
 * nothing else. Run from tests/e2e:
 *
 *   E2E_BASE_URL=https://pay-pals-m00n1.vercel.app npx tsx src/visual-pass.capture.ts before
 *   E2E_BASE_URL=<preview url> npx tsx src/visual-pass.capture.ts after
 *
 * Writes docs/visual-pass/<set>/<page>-<width>.png. Each file is kept under
 * 400 KB by taking the shot at a smaller device scale when the first one is
 * too big (1, then 0.75, then 0.5).
 */
import { mkdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const SET = process.argv[2] ?? "before";
const OUT = resolve(process.cwd(), "..", "..", "docs", "visual-pass", SET);
const WIDTHS = [1280, 390] as const;
const LIMIT = 400 * 1024;
const SCALES = [1, 0.75, 0.5] as const;

interface Shot {
  name: string;
  path: string;
}

/** The finished deals the landing page links to, by scenario. */
async function finishedDeals(browser: Browser): Promise<Record<string, string>> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const cards = page.getByRole("article");
  const out: Record<string, string> = {};
  for (let i = 0; i < (await cards.count()); i++) {
    const card = cards.nth(i);
    const title = ((await card.getByRole("heading").first().textContent()) ?? "").toLowerCase();
    const href = await card.getByRole("link", { name: "See the finished deal" }).getAttribute("href");
    const id = href ? /\/deals\/([^/?]+)/.exec(href)?.[1] : null;
    if (!id) continue;
    out[title.includes("slab") ? "fake-slab" : title.includes("empty") ? "empty-box" : "clean-ps5"] = id;
  }
  await context.close();
  return out;
}

/** One full-page shot at the given width and device scale; returns the file size. */
async function shootAt(browser: Browser, shot: Shot, width: number, scale: number, file: string): Promise<number> {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: scale });
  const page = await context.newPage();
  await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle" });
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
  for (const width of WIDTHS) {
    for (const shot of shots) {
      const file = resolve(OUT, `${shot.name}-${width}.png`);
      let size = 0;
      let used = 1;
      for (const scale of SCALES) {
        size = await shootAt(browser, shot, width, scale, file);
        used = scale;
        if (size <= LIMIT) break;
      }
      console.log(`${file} ${Math.round(size / 1024)} KB at scale ${used}${size > LIMIT ? " (over the 400 KB budget)" : ""}`);
    }
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
