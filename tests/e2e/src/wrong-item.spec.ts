/**
 * Scenario 3: wrong item arrives. Same path to Delivered, then the arrival
 * check names the serial mismatch, the buyer reports the issue and the
 * evidence page shows the locked card and the arrival photos. Fixtures only.
 */
import { expect, test } from "@playwright/test";
import { WRONG_ITEM_ARRIVED_SERIAL, WRONG_ITEM_LOCKED_SERIAL, wrongItem } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";
import { driveToDelivered, runArrivalCheck } from "./flows";
import { expectState, panel, pressAction, snapshot, startDemo } from "./helpers";

test.describe("wrong item arrives", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  test("names the serial mismatch, opens an issue and builds the evidence pack", async ({ page }) => {
    const dealId = await startDemo(page, wrongItem, "buyer");
    await driveToDelivered(page, dealId, wrongItem);

    await runArrivalCheck(page, wrongItem);
    const result = panel(page, "Arrival check");
    await expect(result.getByText("does not match", { exact: true })).toBeVisible();
    const serialRow = result.getByRole("row").filter({ hasText: "serial" });
    await expect(serialRow).toContainText(WRONG_ITEM_LOCKED_SERIAL);
    await expect(serialRow).toContainText(WRONG_ITEM_ARRIVED_SERIAL);

    // A failed arrival check already says what is wrong, so this reports reason arrival_mismatch directly.
    await pressAction(page, "Report an issue");
    await expectState(page, "Issue open");
    await expect(panel(page, "Timeline").getByRole("listitem").filter({ hasText: "Issue opened: what arrived does not match the locked card" })).toBeVisible();

    const snap = await snapshot(page, dealId);
    expect(snap.deal.state).toBe("ISSUE");
    expect(snap.hasEvidence).toBe(true);

    await panel(page, "Next step").getByRole("link", { name: "Open the evidence pack" }).click();
    await expect(page).toHaveURL(new RegExp(`/deals/${dealId}/evidence\\?as=buyer$`));
    await expect(page.getByText("Pay Pals evidence pack")).toBeVisible();

    const lockedCard = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Locked item card, version \d+$/ }) });
    await expect(lockedCard).toBeVisible();
    await expect(lockedCard.getByText(WRONG_ITEM_LOCKED_SERIAL)).toBeVisible();

    const arrivalPhotos = page.locator("section").filter({ has: page.getByRole("heading", { name: `Buyer's arrival photos (${wrongItem.arrivalPhotos.length})` }) });
    await expect(arrivalPhotos).toBeVisible();
    await expect(arrivalPhotos.getByText("None.")).toHaveCount(0);

    const arrivalCheck = page.locator("section").filter({ has: page.getByRole("heading", { name: "Arrival check" }) });
    await expect(arrivalCheck).toContainText(WRONG_ITEM_LOCKED_SERIAL);
    await expect(arrivalCheck).toContainText(WRONG_ITEM_ARRIVED_SERIAL);
  });
});
