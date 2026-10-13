/**
 * No page a judge opens carries a claim Matt withdrew.
 *
 * Matt's addition to the refresh plan, and the right instrument: a
 * sentence should not be defended by a pixel count. The landing was
 * carrying "the strongest warning sign" and the slab card's "$400 ... $140"
 * price claim, both withdrawn, while every suite was green, because the
 * other guards read source files and the visual baselines, which had the
 * words in the picture, passed under a two percent pixel tolerance.
 *
 * The rules and the denial rule both come from `packages/contracts`. This
 * spec adds only what no table carries yet: see withdrawn-copy.ts.
 *
 * Fixtures only, no keys.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { ALL_FIXTURES, WITHDRAWN_CLAIMS, withdrawnClaimsIn } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";
import { waitForHydration, waitForReviewIdle } from "./helpers";
import { finishedDeal } from "./layout-helpers";
import { breaches, localClaims, parseRules, pendingMigration, COPY_RULES_FILE, PAGE_CLAIMS } from "./withdrawn-copy";

const LOCAL = localClaims();

/** What a visitor reads: rendered text, not markup, so a class name or a URL cannot trip it. */
async function visibleText(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

async function expectNoWithdrawnClaims(page: Page, where: string): Promise<void> {
  const found = breaches(await visibleText(page), LOCAL);
  expect(
    found.map((f) => `[${f.id}] "${f.line}" (${f.why})`),
    `${where} carries copy that was withdrawn`,
  ).toEqual([]);
}

test.describe("withdrawn copy never reaches a page", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  test("the shared list is applied whole, and apps/web's leftovers on top", () => {
    expect([...new Set(WITHDRAWN_CLAIMS.map((c) => c.id))].sort()).toEqual(["D10", "D11", "D8", "D9"]);

    const source = readFileSync(COPY_RULES_FILE, "utf8");
    const parsed = parseRules(source);
    // 2026-10-12: this said 15. The expectation was wrong, not the code. b32b7f4 moved four
    // rules (D8 strongest sign, D8 proof of fraud, D9 proves ownership, D10 get your money
    // back) into WITHDRAWN_CLAIMS on purpose, in wider forms, leaving 11 in apps/web.
    // Nothing was lost: the shared list is asserted whole just above (PLAN.md Decision 16).
    expect(parsed.length, `rules parsed out of ${COPY_RULES_FILE}`).toBeGreaterThanOrEqual(11);
    const extra = pendingMigration(source);
    console.log(`${extra.length} of ${parsed.length} apps/web rules are not in WITHDRAWN_CLAIMS by exact pattern, an upper bound since a shared pattern that is a superset still counts`);
    expect(LOCAL.length).toBe(extra.length + PAGE_CLAIMS.length);
  });

  test("the guard can fail, and does not fail an honest denial", () => {
    // The two the landing really carried, a third in other words, and one the shared list
    // learned the hard way. If any goes unnoticed the page checks below mean nothing.
    for (const sample of [
      "A refusal to use Pay Pals is the strongest warning sign.",
      "A graded Pokemon card that sells for about $400 is listed at $140.",
      "This proves the seller owns the item.",
      "We guarantee a refund, and this is not a scam.",
    ]) {
      expect(breaches(sample, LOCAL), `a withdrawn claim went unnoticed: "${sample}"`).not.toEqual([]);
    }

    // And the sentences the rules actually want, through the whole guard rather than through
    // the shared list alone: three of these are live on the rooms today and the first version
    // of this guard failed all three, because apps/web's rules reached them without that
    // table's own denial exemption.
    for (const honest of [
      "A matching cert supports the listing. It is not a check that the item is genuine.",
      "Cert 72096346 matches the demo PSA record. The slab exists. That doesn't prove the seller has it.",
      "Nothing here proves the seller owns the item.",
      "A matching serial or cert number supports the listing. It is not a check that the seller owns the item, and not a check that the item is genuine.",
      "Card serial AJ164952580 compared with AJ164952580, the number the seller photographed on the box: the same number. A matching serial supports the listing. It is not a check of ownership and not a check that the item is genuine.",
    ]) {
      expect(breaches(honest, LOCAL), `an honest sentence was called a breach: "${honest}"`).toEqual([]);
      expect(withdrawnClaimsIn(honest), `the shared list called it a breach: "${honest}"`).toEqual([]);
    }
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
