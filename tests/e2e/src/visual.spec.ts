/**
 * Visual pass, Oct 9 (PLAN item 14): the landing page, the three finished
 * demo deals (buyer view) and both evidence pages at 1280 and 390 px,
 * against the baselines under tests/e2e/__screenshots__/. The baselines
 * come from the demo-only server, so they are deterministic once the parts
 * a fresh seed changes (times, deal ids, hashes) are masked and the clean
 * deal's evidence pack is built (the state the suite leaves it in). Refresh them
 * on purpose, from tests/e2e, and read the diff before committing:
 *   npx playwright test src/visual.spec.ts --update-snapshots
 * Fixtures only, no keys.
 */
import { expect, test, type Page } from "@playwright/test";
import { ALL_FIXTURES, type ScenarioFixture } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";
import { waitForHydration } from "./helpers";
import { finishedDeal, openSettled } from "./layout-helpers";

const WIDTHS = [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
] as const;
/** The two evidence pages the landing leads to: the clean deal's empty state and the empty box's built pack. */
const EVIDENCE: ScenarioFixture["id"][] = ["clean-ps5", "empty-box"];

/** What a fresh seed changes: times, deal ids, event hashes. Masked, so one baseline holds across servers. */
function dynamic(page: Page) {
  return [
    page.getByText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/),
    page.getByText(/Invoice [0-9a-f-]{36}/),
    page.getByText(/^Deal [0-9a-f-]{36}\./),
    page.getByTestId("summary-hash"),
    page.locator("span", { hasText: /^#[0-9a-f]{8}$/ }),
  ];
}

async function expectPageToMatch(page: Page, name: string): Promise<void> {
  await expect(page).toHaveScreenshot(name, { fullPage: true, mask: dynamic(page) });
}

/**
 * The clean deal is seeded without an evidence pack and other specs in the
 * same run build one (review-oct7, phone-width), which adds a pal message
 * and a timeline event. The baselines show the built state, so every run
 * converges on it here first. Nothing to do on the other two deals.
 */
async function ensureEvidenceBuilt(page: Page, dealId: string): Promise<void> {
  await page.goto(`/deals/${dealId}/evidence?as=buyer`);
  await waitForHydration(page);
  const build = page.getByRole("button", { name: "Build the evidence pack" });
  if ((await build.count()) > 0) {
    await build.click();
    await expect(page.getByText("Pay Pals evidence pack")).toBeVisible({ timeout: 60_000 });
  }
}

test.describe("visual baselines", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  for (const size of WIDTHS) {
    test.describe(`${size.width} px`, () => {
      test.use({ viewport: size });

      test("landing page", async ({ page }) => {
        await openSettled(page, "/");
        await expectPageToMatch(page, `landing-${size.width}.png`);
      });

      for (const fixture of ALL_FIXTURES) {
        test(`${fixture.id} deal room`, async ({ page }) => {
          const { href, dealId } = await finishedDeal(page, fixture);
          if (fixture.deal.state === "COMPLETE") await ensureEvidenceBuilt(page, dealId);
          await openSettled(page, href);
          await expectPageToMatch(page, `${fixture.id}-room-${size.width}.png`);
        });
      }

      for (const fixture of ALL_FIXTURES.filter((f) => EVIDENCE.includes(f.id))) {
        test(`${fixture.id} evidence page`, async ({ page }) => {
          const { dealId } = await finishedDeal(page, fixture);
          if (fixture.deal.state === "COMPLETE") await ensureEvidenceBuilt(page, dealId);
          await openSettled(page, `/deals/${dealId}/evidence?as=buyer`);
          await expectPageToMatch(page, `${fixture.id}-evidence-${size.width}.png`);
        });
      }
    });
  }
});
