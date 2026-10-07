/**
 * Scenario 2: clean deal, end to end on the demo buttons. Review, agree and
 * lock, pay, ship as the seller, confirm delivery, arrival check matches,
 * complete. The state badge is asserted at every step. Fixtures only, no keys.
 */
import { expect, test } from "@playwright/test";
import { cleanGarmin } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";
import { driveToDelivered, runArrivalCheck } from "./flows";
import { expectState, panel, pressAction, snapshot, startDemo } from "./helpers";

test.describe("clean deal", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  test("runs from Listed to Complete with the card locked and the serial confirmed", async ({ page }) => {
    const dealId = await startDemo(page, cleanGarmin, "buyer");
    await expect(page.getByRole("banner").getByRole("heading", { name: cleanGarmin.cards[0]!.title })).toBeVisible();

    await driveToDelivered(page, dealId, cleanGarmin);

    await runArrivalCheck(page, cleanGarmin);
    const result = panel(page, "Arrival check");
    await expect(result.getByText("matches", { exact: true })).toBeVisible();
    await expect(result.getByText(cleanGarmin.cards[0]!.serial!)).toBeVisible();

    await pressAction(page, "Complete the deal");
    await expectState(page, "Complete");
    await expect(panel(page, "Next step").getByText("complete", { exact: false })).toBeVisible();

    const snap = await snapshot(page, dealId);
    expect(snap.deal.state).toBe("COMPLETE");
    expect(snap.deal.lockedCardVersion).toBe(1);
  });
});
