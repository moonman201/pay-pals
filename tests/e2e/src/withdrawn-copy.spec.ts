/**
 * No page a judge opens carries a claim Matt withdrew.
 *
 * Matt's addition to the refresh plan, and it is the right instrument: a
 * sentence should not be defended by a pixel count. The landing was
 * carrying "the strongest warning sign" and the slab card's "$400 ... $140"
 * price claim, both withdrawn, while every suite was green, because the
 * three existing guards read source files and the visual baselines, which
 * had the words in the picture, passed under a two percent pixel
 * tolerance. This reads the text a visitor sees.
 *
 * The rules are not written here. They are parsed out of apps/web's own
 * copy-rules table at run time, so this covers the withdrawn claims as a
 * class and a rule added there reaches the pages without anyone copying
 * it. See withdrawn-copy.ts for why that file is read rather than
 * imported, and for the two claims that belong to a page rather than to
 * the code.
 *
 * Fixtures only, no keys.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { ALL_FIXTURES } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";
import { waitForHydration, waitForReviewIdle } from "./helpers";
import { finishedDeal } from "./layout-helpers";
import { breaches, parseMarkdownRules, parseRules, withdrawnClaims, COPY_RULES_FILE, MARKDOWN_RULES_FILE, PAGE_CLAIMS } from "./withdrawn-copy";

const CLAIMS = withdrawnClaims();

/** What a visitor reads: rendered text, not markup, so a class name or a URL cannot trip it. */
async function visibleText(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

async function expectNoWithdrawnClaims(page: Page, where: string): Promise<void> {
  const found = breaches(await visibleText(page), CLAIMS);
  expect(
    found.map((f) => `[${f.claim.id}] "${f.line}" (${f.claim.why})`),
    `${where} carries copy that was withdrawn`,
  ).toEqual([]);
}

test.describe("withdrawn copy never reaches a page", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  test("the rules come from the two tables that already exist, and both are still there", () => {
    const fromCode = parseRules(readFileSync(COPY_RULES_FILE, "utf8"));
    const fromMarkdown = parseMarkdownRules(readFileSync(MARKDOWN_RULES_FILE, "utf8"));
    // If either drops, that table was refactored and these pages are being checked against a
    // handful of rules rather than all of them. Numbers, so neither can rot quietly to one.
    expect(fromCode.length, `rules parsed out of ${COPY_RULES_FILE}`).toBeGreaterThanOrEqual(15);
    expect(fromMarkdown.length, `rules parsed out of ${MARKDOWN_RULES_FILE}`).toBeGreaterThanOrEqual(10);
    for (const parsed of [fromCode, fromMarkdown]) {
      const ids = new Set(parsed.map((r) => r.id));
      for (const id of ["D8", "D9", "D10", "D11"]) expect([...ids], `${id} is in the table`).toContain(id);
    }
    expect(CLAIMS.length).toBe(fromCode.length + fromMarkdown.length + PAGE_CLAIMS.length);
  });

  test("the guard can fail: the withdrawn sentences are still caught", () => {
    // The two the landing really carried, and a third in other words. If this ever passes an
    // empty list the patterns have stopped matching and every page check below means nothing.
    const samples = [
      "A refusal to use Pay Pals is the strongest warning sign.",
      "A graded Pokemon card that sells for about $400 is listed at $140.",
      "This proves the seller owns the item.",
    ];
    for (const sample of samples) {
      expect(breaches(sample, CLAIMS), `a withdrawn claim went unnoticed: "${sample}"`).not.toEqual([]);
    }
    // And it does not fire on the sentence the rules actually want.
    expect(breaches("A matching cert supports the listing. It is not a check that the item is genuine.", CLAIMS)).toEqual([]);
  });

  test("the landing page", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
    await expectNoWithdrawnClaims(page, "the landing page");
  });

  test("the start page", async ({ page }) => {
    await page.goto("/deals/new");
    await waitForHydration(page);
    await expectNoWithdrawnClaims(page, "/deals/new");
  });

  for (const fixture of ALL_FIXTURES) {
    test(`${fixture.id}: the deal room and its evidence page`, async ({ page }) => {
      const { dealId } = await finishedDeal(page, fixture);
      await waitForHydration(page);
      await waitForReviewIdle(page);
      await expectNoWithdrawnClaims(page, `the ${fixture.id} deal room`);

      await page.goto(`/deals/${dealId}/evidence?as=buyer`);
      await waitForHydration(page);
      await expectNoWithdrawnClaims(page, `the ${fixture.id} evidence page`);
    });
  }
});
