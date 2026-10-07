/**
 * Scenario 2, first step: a judge picks the clean deal on the landing page,
 * plays as the buyer, and lands in a fresh deal room that reads Listed.
 * Skips itself when apps/web is not on the branch.
 */
import { expect, test } from "@playwright/test";
import { cleanGarmin } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";

test.describe("clean deal from the landing page", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  test("starts as buyer and opens a deal room in Listed", async ({ page }) => {
    await page.goto("/");

    const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: cleanGarmin.name }) });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Play as buyer" }).click();

    await expect(page).toHaveURL(/\/deals\/[^/?]+\?as=buyer$/);
    expect(page.url()).not.toContain(cleanGarmin.deal.id);

    const header = page.getByRole("banner");
    await expect(header.getByRole("heading", { name: cleanGarmin.cards[0]!.title })).toBeVisible();
    await expect(header.getByText("You are the buyer", { exact: false })).toBeVisible();
    await expect(header.getByText("Listed", { exact: true })).toBeVisible();
  });
});
