/**
 * Helpers for the visual pass: the finished deal behind a landing card, a
 * page settled for a screenshot, and the 44 px tap-target rule.
 */
import { expect, type Page } from "@playwright/test";
import type { ScenarioFixture } from "@pay-pals/contracts";
import { waitForHydration, waitForReviewIdle } from "./helpers";

/** A deal room URL ends in the deal's uuid. Anchored, so "finished" is not mistaken for an id. */
export const DEAL_ID_IN_URL = /\/deals\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[?#/]|$)/i;

/**
 * Open the finished demo deal for a scenario from the landing page, and say
 * where it landed. The one place in the suite that turns a landing card into
 * a deal id.
 *
 * The id comes from the URL after following the link, never from the link.
 * The landing used to print the deal id into the href, and three helpers
 * read it back out because it was there; one re-seed made every copy of
 * that page dead, which is what Matt hit on production. The href is now
 * `/deals/finished/<scenario>`, resolved at request time.
 *
 * So this also asserts the href still carries no id. A helper that merely
 * tolerated an id-less link would tolerate the id coming back, and the
 * coupling would be rebuilt by the next person who finds an id convenient.
 * `href` is returned for callers that want to open it again: it is the
 * stable link, and it stays right across a re-seed.
 */
export async function finishedDeal(page: Page, fixture: ScenarioFixture): Promise<{ href: string; dealId: string }> {
  await page.goto("/");
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: fixture.name }) });
  const link = card.getByRole("link", { name: "See the finished deal" });
  await expect(link, `${fixture.id}: the landing page offers the finished deal`).toBeVisible();
  const href = (await link.getAttribute("href")) ?? "";
  expect(href, `${fixture.id}: the landing must link by scenario, so a cached page cannot hold a dead id: ${href}`).not.toMatch(DEAL_ID_IN_URL);

  await page.goto(href);
  const dealId = DEAL_ID_IN_URL.exec(page.url())?.[1];
  if (!dealId) throw new Error(`${fixture.id}: ${href} did not land on a deal room (${page.url()})`);
  return { href, dealId };
}

/**
 * Open a page for a screenshot: motion off, hydrated, the review finished
 * rather than still streaming in, every image loaded (the page is scrolled
 * through once so lazy images below the fold load), back at the top.
 */
export async function openSettled(page: Page, path: string): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(path, { waitUntil: "networkidle" });
  await waitForHydration(page);
  await waitForReviewIdle(page);
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo(0, 0);
  });
  // Only images that are rendered. A lazy image inside a collapsed <details> (the pal's
  // working, the timeline) is never fetched, so `complete` stays false for ever; it is not
  // on the page, so it is not in the screenshot either.
  await page.waitForFunction(
    () => Array.from(document.images).filter((img) => img.checkVisibility()).every((img) => img.complete),
    undefined,
    { timeout: 15_000 },
  );
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
