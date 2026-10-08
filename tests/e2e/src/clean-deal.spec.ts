/**
 * Scenario 2: clean deal, end to end on the demo buttons. Review, agree and
 * lock, pay, ship as the seller, confirm delivery, arrival check matches,
 * complete. The state badge is asserted at every step. Fixtures only, no keys.
 */
import { expect, test } from "@playwright/test";
import { cleanPs5 } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";
import { confirmDelivery, payByCaptureButton, reviewAndAgree, runArrivalCheck, shipAsSeller } from "./flows";
import { expectState, panel, pressAction, snapshot, startDemo, waitForHydration } from "./helpers";

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

    // Pay by the capture button: the order is created, the buyer comes back approved, one press captures.
    await expectState(page, "Listed");
    await reviewAndAgree(page, dealId, 1);
    const pay = panel(page, "Pay");
    await expect(pay).toBeVisible();
    // The default e2e server is demo-only, so the sandbox test buyer note never shows here (its presence is a component test).
    await expect(pay.getByText("PayPal sandbox test buyer, no real money")).toHaveCount(0);
    await expect(page.getByTestId("sandbox-buyer")).toHaveCount(0);
    await payByCaptureButton(page, dealId);
    await expect(page.getByTestId("sandbox-buyer")).toHaveCount(0);
    await shipAsSeller(page, dealId, cleanPs5);
    await confirmDelivery(page, dealId);

    // J6: a deal paid through the demo gateway is a real deal with a DEMO- order, not a seeded example.
    const payment = panel(page, "Payment");
    await expect(payment.getByText("PayPal order", { exact: true })).toBeVisible();
    await expect(payment.getByText(/Example order id|placeholders/)).toHaveCount(0);
    await expect(page.getByText("Example deal, seeded from a scenario")).toHaveCount(0);
    await expect(page.getByRole("banner").getByText(/History unchanged since PayPal order/)).toBeVisible();

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
    expect(snap.deal.startedBy).toBe("buyer");
    expect(snap.payment?.historyHash).toMatch(/^[0-9a-f]{64}$/);

    // The evidence pack: the chain head PayPal holds still reproduces from the stored events.
    await page.goto(`/deals/${dealId}/evidence?as=buyer`);
    await waitForHydration(page);
    await page.getByRole("button", { name: "Build the evidence pack" }).click();
    await expect(page.getByText("Pay Pals evidence pack")).toBeVisible();
    const history = page.locator("section").filter({ has: page.getByRole("heading", { name: "Tamper-evident history" }) });
    await expect(history).toBeVisible();
    await expect(history).toContainText(`${dealId}#${snap.payment!.historyHash}`);
    await expect(history).toContainText("Verified: the stored events reproduce this hash.");
    await expect(history).not.toContainText("Does not verify");
    await expect(page.getByText("Example deal, seeded from a scenario")).toHaveCount(0);
    // The seller shipped with every photo, so no ship-time caution rides on this pack.
    await expect(page.getByRole("heading", { name: "What the Buyer Pal asked and never got" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Buyer Pal shipment check" })).toHaveCount(0);
  });
});
