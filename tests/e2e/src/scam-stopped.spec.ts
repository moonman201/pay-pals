/**
 * Scenario 1: scam stopped. The buyer asks for a review and the deal is
 * blocked on the spot: payment-method flag, no Agree button, no override,
 * and the timeline says why. Fixtures only, no keys.
 */
import { expect, test } from "@playwright/test";
import { scamGarmin } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";
import { expectState, expectStateAfterPal, panel, pressAction, snapshot, startDemo } from "./helpers";

test.describe("scam stopped", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  test("the review blocks the deal before any money moves", async ({ page }) => {
    const dealId = await startDemo(page, scamGarmin, "buyer");
    await expectState(page, "Listed");

    await pressAction(page, "Ask my pal to review");
    await expectStateAfterPal(page, "Blocked");

    const flags = panel(page, "Buyer Pal review").getByRole("list", { name: "Red flags" });
    await expect(flags.getByText("friends and family request", { exact: true })).toBeVisible();
    await expect(flags.getByText("price far below market", { exact: true })).toBeVisible();
    await expect(flags.getByText("urgency pressure", { exact: true })).toBeVisible();
    await expect(flags.getByText("payment method, no override").first()).toBeVisible();

    const next = panel(page, "Next step");
    await expect(next).toBeVisible();
    await expect(next.getByRole("button", { name: "Agree and lock the card" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Agree and lock the card" })).toHaveCount(0);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(next.getByText("Goods and Services", { exact: false })).toBeVisible();

    const lastLine = panel(page, "Timeline").getByRole("listitem").last();
    await expect(lastLine).toContainText("Pay Pals will not move money outside a Goods and Services payment");

    const snap = await snapshot(page, dealId);
    expect(snap.deal.state).toBe("BLOCKED");
    expect(snap.deal.lockedCardVersion).toBeNull();
  });
});
