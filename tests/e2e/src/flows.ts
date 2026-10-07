/**
 * The steps of a deal as a judge clicks them, each asserting the state badge
 * it leaves behind. The clean and wrong-item specs share the path to
 * Delivered; only the arrival check differs.
 */
import { expect, type Page } from "@playwright/test";
import type { ScenarioFixture } from "@pay-pals/contracts";
import { PAL_TIMEOUT, addAllDemoPhotos, expectState, expectStateAfterPal, openRoomAs, panel, pressAction } from "./helpers";

/** Buyer asks for the review. Caution flags get the override box ticked; a payment-method flag would block, which these two scenarios never raise. */
export async function reviewAndAgree(page: Page): Promise<void> {
  await pressAction(page, "Ask my pal to review");
  await expectStateAfterPal(page, "Reviewed");
  await expect(panel(page, "Buyer Pal review")).toBeVisible();

  const override = panel(page, "Next step").getByRole("checkbox");
  if ((await override.count()) > 0) await override.check();
  await pressAction(page, "Agree and lock the card");
  await expectState(page, "Agreed, card locked");
  await expect(panel(page, "Item card").getByText(/^Locked, version \d+$/)).toBeVisible();
}

/** Buyer pays with the demo buttons: one click creates the order and captures it through the same routes the real buttons use. */
export async function payWithDemoButtons(page: Page, method: "PayPal" | "Venmo" = "PayPal"): Promise<void> {
  const pay = panel(page, "Pay");
  await expect(pay.getByText("Goods and Services", { exact: false })).toBeVisible();
  await pay.getByRole("button", { name: `Pay with ${method} (demo)` }).click();
  await expectState(page, "Paid");
  await expect(panel(page, "Payment")).toBeVisible();
}

/** Seller ticks the Seller Pal's checklist, adds the demo packing photos, uses the demo tracking number and ships. */
export async function shipAsSeller(page: Page, dealId: string, fixture: ScenarioFixture): Promise<void> {
  await openRoomAs(page, dealId, "seller");
  await expectState(page, "Paid");
  const step = panel(page, "Pack and ship");
  await expect(step).toBeVisible();

  const boxes = step.getByRole("checkbox");
  const count = await boxes.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) await boxes.nth(i).check();

  await addAllDemoPhotos(step);
  await step.getByRole("button", { name: "Use the demo tracking number" }).click();
  // Exact, or "Tracking number" also matches the checklist line "Enter the carrier and tracking number".
  await expect(step.getByLabel("Tracking number", { exact: true })).toHaveValue(fixture.shipment!.trackingNumber);
  await expect(step.getByRole("combobox")).toHaveValue(fixture.shipment!.carrier);

  // The action bar has a button with the same name that only scrolls here, so stay inside the form.
  await step.getByRole("button", { name: "Mark as shipped" }).click();
  await expectState(page, "Shipped");
  await expect(panel(page, "Shipment").getByText(fixture.shipment!.trackingNumber)).toBeVisible();
}

/** Buyer confirms the box arrived. */
export async function confirmDelivery(page: Page, dealId: string): Promise<void> {
  await openRoomAs(page, dealId, "buyer");
  await expectState(page, "Shipped");
  await pressAction(page, "Confirm delivery");
  await expectState(page, "Delivered");
}

/** Buyer adds the scenario's arrival photos and asks the pal to compare them to the locked card. */
export async function runArrivalCheck(page: Page, fixture: ScenarioFixture): Promise<void> {
  const step = panel(page, "Arrival check");
  const added = await addAllDemoPhotos(step);
  expect(added).toBe(fixture.arrivalPhotos.length);
  await step.getByRole("button", { name: "Ask my pal to check" }).click();
  await expect(panel(page, "Arrival check").getByText(/^(matches|does not match)$/)).toBeVisible({ timeout: PAL_TIMEOUT });
}

/** Review, agree, pay, ship, deliver. Leaves the buyer in a Delivered room with the arrival step open. */
export async function driveToDelivered(page: Page, dealId: string, fixture: ScenarioFixture): Promise<void> {
  await expectState(page, "Listed");
  await reviewAndAgree(page);
  await payWithDemoButtons(page, fixture.payment?.method === "venmo" ? "Venmo" : "PayPal");
  await shipAsSeller(page, dealId, fixture);
  await confirmDelivery(page, dealId);
}
