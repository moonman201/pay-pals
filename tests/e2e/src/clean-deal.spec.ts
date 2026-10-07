/**
 * Scenario 2: clean deal, end to end on the demo buttons. Review, agree and
 * lock, pay, ship as the seller, confirm delivery, arrival check matches,
 * complete. The state badge is asserted at every step. Fixtures only, no keys.
 */
import { expect, test } from "@playwright/test";
import { cleanPs5 } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";
import { driveToDelivered, runArrivalCheck } from "./flows";
import { expectState, panel, pressAction, snapshot, startDemo } from "./helpers";

test.describe("clean deal", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  test("runs from Listed to Complete with the card locked and the serial confirmed", async ({ page }) => {
    const dealId = await startDemo(page, cleanPs5, "buyer");
    await expect(page.getByRole("banner").getByRole("heading", { name: cleanPs5.cards[0]!.title })).toBeVisible();

    // The Seller Pal read the console serial and the box label and they match.
    const card = panel(page, "Item card");
    await expect(card.getByText("Box serial", { exact: true })).toBeVisible();
    const boxSerialRow = card.locator("dd").filter({ hasText: "matches the console" });
    await expect(boxSerialRow).toHaveCount(1);
    await expect(boxSerialRow).toContainText(cleanPs5.cards[0]!.boxSerial!);

    await driveToDelivered(page, dealId, cleanPs5);

    await runArrivalCheck(page, cleanPs5);
    const result = panel(page, "Arrival check");
    await expect(result.getByText("matches", { exact: true })).toBeVisible();
    // The serial shows in the "Read: serial" field and, with a real pal, in its message too.
    await expect(result.getByText(cleanPs5.cards[0]!.serial!).first()).toBeVisible();

    await pressAction(page, "Complete the deal");
    await expectState(page, "Complete");
    await expect(panel(page, "Next step").getByText("complete", { exact: false })).toBeVisible();

    const snap = await snapshot(page, dealId);
    expect(snap.deal.state).toBe("COMPLETE");
    expect(snap.deal.lockedCardVersion).toBe(1);
  });
});
