/**
 * Smoke: the demo landing page loads and offers all three scenarios by name.
 * Skips itself when apps/web is not on the branch.
 */
import { expect, test } from "@playwright/test";
import { ALL_FIXTURES } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";

test.describe("demo landing page", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  test("lists the three demo scenarios", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Pay Pals/);
    expect(ALL_FIXTURES).toHaveLength(3);
    for (const fixture of ALL_FIXTURES) {
      await expect(page.getByText(fixture.name, { exact: false }).first()).toBeVisible();
    }

    // One finished deal per scenario, no more: two instances seeding at once must settle on one (J7, the oldest).
    const finished = page.getByRole("link", { name: "See the finished deal" });
    await expect(finished).toHaveCount(ALL_FIXTURES.length);
    const hrefs = await finished.evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
    expect(new Set(hrefs).size, `distinct finished deals: ${hrefs.join(", ")}`).toBe(ALL_FIXTURES.length);
    for (const fixture of ALL_FIXTURES) {
      const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: fixture.name }) });
      await expect(card.getByRole("link", { name: "See the finished deal" })).toHaveCount(1);
    }
  });
});
