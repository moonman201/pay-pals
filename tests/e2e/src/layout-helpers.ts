/**
 * Helpers for the visual pass: the finished deal behind a landing card, a
 * page settled for a screenshot, and the 44 px tap-target rule.
 */
import { expect, type Page } from "@playwright/test";
import type { ScenarioFixture } from "@pay-pals/contracts";
import { waitForHydration } from "./helpers";

/** The finished deal the landing page links to for a scenario: its href and id. */
export async function finishedDeal(page: Page, fixture: ScenarioFixture): Promise<{ href: string; dealId: string }> {
  await page.goto("/");
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: fixture.name }) });
  const link = card.getByRole("link", { name: "See the finished deal" });
  await expect(link, `${fixture.id}: the landing page offers the finished deal`).toBeVisible();
  const href = (await link.getAttribute("href")) ?? "";
  const dealId = /\/deals\/([^/?]+)/.exec(href)?.[1];
  if (!dealId) throw new Error(`${fixture.id}: no deal id in the finished deal link ${href}`);
  return { href, dealId };
}

/**
 * Open a page for a screenshot: motion off, hydrated, every image loaded
 * (the page is scrolled through once so lazy images below the fold load),
 * back at the top.
 */
export async function openSettled(page: Page, path: string): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(path, { waitUntil: "networkidle" });
  await waitForHydration(page);
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete), undefined, { timeout: 15_000 });
  await page.waitForTimeout(300);
}

/** PLAN item 11: the visible buttons and links shorter than 44 px on this page, one line each, so a thumb can hit the rest. */
export async function shortTapTargets(page: Page, where: string, min = 44): Promise<string[]> {
  const short = await page.evaluate((min) => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('a[href], button, [role="button"], [role="tab"], input[type="submit"]'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden") continue;
      if (r.height + 0.5 < min) {
        const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 50);
        out.push(`<${el.tagName.toLowerCase()}> ${Math.round(r.height)} px tall "${text}"`);
      }
    }
    return out;
  }, min);
  return short.map((line) => `${where}: ${line}`);
}
