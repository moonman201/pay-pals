/**
 * Visual pass, Oct 9 (PLAN item 14): the landing page, the three finished
 * demo deals (buyer view) and both evidence pages at 1280 and 390 px,
 * against the baselines under tests/e2e/__screenshots__/. They are taken
 * from the demo-only server this config starts, where the seed is the same
 * every time and the warm-up leaves every finished deal in one known state;
 * the parts a fresh seed still changes (times, deal ids, hashes) are masked.
 * A server we did not start is skipped: the baselines would not hold and
 * these pages must not be written to. Refresh them on purpose, from
 * tests/e2e, and read the diff before committing:
 *   npx playwright test src/visual.spec.ts --update-snapshots
 * Fixtures only, no keys.
 */
import { expect, test, type Page } from "@playwright/test";
import { ALL_FIXTURES, type ScenarioFixture } from "@pay-pals/contracts";
import { STARTS_SERVER, WEB_PRESENT } from "./env";
import { finishedDeal, openSettled } from "./layout-helpers";

const WIDTHS = [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
] as const;
/** The two evidence pages the landing leads to: the clean deal's empty state and the empty box's built pack. */
const EVIDENCE: ScenarioFixture["id"][] = ["clean-ps5", "empty-box"];

/** What a fresh seed changes and a baseline cannot hold: times, deal ids and event hashes. */
const DYNAMIC = /\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|#[0-9a-f]{8}\b|\b[0-9a-f]{64}\b/;

/**
 * Tag the deepest element holding each of those, so the mask covers the
 * date or the id and not the whole paragraph around it. Returns how many
 * were tagged, which the caller asserts on so a page that stops showing
 * them (or a pattern that stops matching) does not quietly pass.
 */
async function markDynamic(page: Page, pattern: string): Promise<number> {
  return page.evaluate((source) => {
    const re = new RegExp(source);
    let marked = 0;
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      if (!re.test(el.textContent ?? "")) continue;
      // Only the deepest match: if a child also matches, let the child carry the mask.
      if (Array.from(el.children).some((child) => re.test(child.textContent ?? ""))) continue;
      el.setAttribute("data-dynamic", "");
      marked += 1;
    }
    return marked;
  }, pattern);
}

async function expectPageToMatch(page: Page, name: string): Promise<void> {
  const marked = await markDynamic(page, DYNAMIC.source);
  expect(marked, `${name}: elements masked as seed-dependent`).toBeGreaterThan(0);
  await expect(page).toHaveScreenshot(name, { fullPage: true, mask: [page.locator("[data-dynamic]")] });
}

test.describe("visual baselines", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");
  test.skip(!STARTS_SERVER, "the baselines belong to the demo-only server this config starts");

  for (const size of WIDTHS) {
    test.describe(`${size.width} px`, () => {
      test.use({ viewport: size });

      test("landing page", async ({ page }) => {
        await openSettled(page, "/");
        await expectPageToMatch(page, `landing-${size.width}.png`);
      });

      for (const fixture of ALL_FIXTURES) {
        test(`${fixture.id} deal room`, async ({ page }) => {
          const { href } = await finishedDeal(page, fixture);
          await openSettled(page, href);
          await expectPageToMatch(page, `${fixture.id}-room-${size.width}.png`);
        });
      }

      for (const fixture of ALL_FIXTURES.filter((f) => EVIDENCE.includes(f.id))) {
        test(`${fixture.id} evidence page`, async ({ page }) => {
          const { dealId } = await finishedDeal(page, fixture);
          await openSettled(page, `/deals/${dealId}/evidence?as=buyer`);
          await expectPageToMatch(page, `${fixture.id}-evidence-${size.width}.png`);
        });
      }
    });
  }
});
