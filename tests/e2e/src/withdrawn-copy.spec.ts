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
import { WITHDRAWN_CLAIMS } from "@pay-pals/contracts";
import { breaches, pageClaims, parseRules, pendingMigration, sharedClaims, COPY_RULES_FILE, PAGE_CLAIMS } from "./withdrawn-copy";

const CLAIMS = pageClaims();

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

  test("the shared list is applied whole, and apps/web's leftovers are applied on top", () => {
    // The policy comes from packages/contracts now. Every pattern in it reaches these pages.
    const shared = sharedClaims();
    expect(shared.length, "patterns in WITHDRAWN_CLAIMS").toBe(WITHDRAWN_CLAIMS.reduce((n, c) => n + c.patterns.length, 0));
    expect([...new Set(WITHDRAWN_CLAIMS.map((c) => c.id))].sort()).toEqual(["D8", "D9", "D10", "D11"].sort());
    for (const claim of shared) expect(CLAIMS.map((c) => c.pattern.source), `${claim.id} reaches the pages`).toContain(claim.pattern.source);

    // apps/web has not migrated. Its table is still parsed, and only for what the shared list
    // does not already carry; if that parse ever returns nothing the table changed shape.
    const source = readFileSync(COPY_RULES_FILE, "utf8");
    const parsed = parseRules(source);
    expect(parsed.length, `rules parsed out of ${COPY_RULES_FILE}`).toBeGreaterThanOrEqual(15);
    const extra = pendingMigration(source);
    console.log(
      `${extra.length} of ${parsed.length} apps/web rules are not in WITHDRAWN_CLAIMS by exact pattern, an upper bound since a shared pattern that is a superset still counts:\n  ${[...new Set(extra.map((e) => e.pattern.source))].join("\n  ")}`,
    );
    expect(CLAIMS.length).toBe(shared.length + extra.length + PAGE_CLAIMS.length);
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
    // And it does not fire on the sentences the rules actually want, including the one the slab
    // room really says, where the denial is a contraction and sits immediately before the claim.
    for (const honest of [
      "A matching cert supports the listing. It is not a check that the item is genuine.",
      "Cert 72096346 matches PSA (demo record)'s record. The slab exists. That doesn't prove the seller has it.",
      "Pay Pals never guarantees a refund.",
    ]) {
      expect(breaches(honest, CLAIMS), `an honest sentence was called a breach: "${honest}"`).toEqual([]);
    }

    // A denial elsewhere in the sentence is not a denial of this claim, so this is still caught.
    expect(breaches("We guarantee a refund, and this is not a scam.", CLAIMS), "a far-away negation excused a claim").not.toEqual([]);
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
