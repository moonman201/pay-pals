/**
 * The steps of a deal as a judge clicks them, each asserting the state badge
 * it leaves behind. The clean and empty-box specs share the path to
 * Delivered; only the arrival check differs.
 */
import { expect, type Page } from "@playwright/test";
import type { ScenarioFixture } from "@pay-pals/contracts";
import { PAL_TIMEOUT, addAllDemoPhotos, expectState, expectStateAfterPal, joinPath, openRoomAs, panel, pressAction, waitForHydration } from "./helpers";

/**
 * The seller opens the invite link and joins with the scenario's listing text
 * and its first photo. The Seller Pal builds card version 1 and the deal
 * reads Listed in the seller's room.
 */
export async function joinAsSeller(page: Page, dealId: string, fixture: ScenarioFixture): Promise<void> {
  await page.goto(joinPath(dealId));
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /wants to buy from you with Pay Pals Protection$/ })).toBeVisible();

  const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "Join and add your photos" }) });
  await form.getByLabel("Your name").fill(fixture.seller.displayName);
  await expect(form.getByLabel("PayPal email that gets paid")).toHaveValue(fixture.seller.email);
  await form.getByLabel("Listing text or a few lines about the item").fill(fixture.listingText);
  await form.getByLabel("Notes for your pal").fill(fixture.sellerNotes);

  // One photo by URL, with its description, the way a seller without the demo picker adds one.
  const photo = fixture.cards[0]!.photos[0]!;
  await form.getByPlaceholder("Photo URL").fill(photo.url);
  await form.getByPlaceholder("What it shows").fill(photo.whatItShows);
  await form.getByRole("button", { name: "Add URL" }).click();
  await expect(form.getByText("1 added")).toBeVisible();

  await form.getByRole("button", { name: "Join and add your photos" }).click();
  await expect(page).toHaveURL(new RegExp(`/deals/${dealId}\\?as=seller$`), { timeout: PAL_TIMEOUT });
  await waitForHydration(page);
  await expectState(page, "Listed");
}

/** Buyer asks for the review. */
export async function reviewAsBuyer(page: Page): Promise<void> {
  await pressAction(page, "Ask my pal to review");
  await expectStateAfterPal(page, "Reviewed");
  await expect(panel(page, "Buyer Pal review")).toBeVisible();
}

/**
 * Buyer agrees to the current version. Caution flags get the override box
 * ticked; a payment-method flag would block, which these scenarios never
 * raise. The button reads "Agree", or "Agree and lock the card" when the
 * seller already agreed. Nothing locks until both sides have agreed.
 */
export async function agreeAsBuyer(page: Page, version: number): Promise<void> {
  const next = panel(page, "Next step");
  const override = next.getByRole("checkbox");
  if ((await override.count()) > 0) await override.check();
  await next.getByRole("button", { name: /^Agree( and lock the card)?$/ }).click();
  await expect(next.getByText(`You agreed to version ${version}, waiting for the other side.`)).toBeVisible();
  await expectState(page, "Reviewed");
}

/** Seller agrees second: the card locks and the deal reads "Agreed, card locked". */
export async function agreeAsSeller(page: Page, dealId: string, version: number): Promise<void> {
  await openRoomAs(page, dealId, "seller");
  await expectState(page, "Reviewed");
  const next = panel(page, "Next step");
  await expect(next.getByText(`The buyer has agreed to version ${version}.`)).toBeVisible();
  await next.getByRole("button", { name: "Agree to this card" }).click();
  await expectState(page, "Agreed, card locked");
  await expect(panel(page, "Item card").getByText(`Locked, version ${version}`)).toBeVisible();

  const agreedLines = panel(page, "Timeline").getByRole("listitem").filter({ hasText: `agreed to card version ${version}.` });
  await expect(agreedLines).toHaveCount(2);
  await expect(agreedLines.filter({ hasText: "The buyer agreed" })).toHaveCount(1);
  await expect(agreedLines.filter({ hasText: "The seller agreed" })).toHaveCount(1);
}

export interface AgreeHooks {
  /** Runs while the buyer has agreed and the seller has not, on the buyer's page. */
  afterBuyerAgreed?: () => Promise<void>;
  /** How the seller ships; by default every checklist item is ticked. */
  ship?: ShipOptions;
}

/** Review as buyer, buyer agrees, seller agrees, back to the buyer's room with the card locked. */
export async function reviewAndAgree(page: Page, dealId: string, version = 1, hooks: AgreeHooks = {}): Promise<void> {
  await reviewAsBuyer(page);
  await agreeAsBuyer(page, version);
  if (hooks.afterBuyerAgreed) await hooks.afterBuyerAgreed();
  await agreeAsSeller(page, dealId, version);
  await openRoomAs(page, dealId, "buyer");
  await expectState(page, "Agreed, card locked");
}

/** Buyer pays with the demo buttons: one click creates the order and captures it through the same routes the real buttons use. */
export async function payWithDemoButtons(page: Page, method: "PayPal" | "Venmo" = "PayPal"): Promise<void> {
  const pay = panel(page, "Pay");
  await expect(pay.getByText("Goods and Services", { exact: false })).toBeVisible();
  await pay.getByRole("button", { name: `Pay with ${method} (demo)` }).click();
  await expectState(page, "Paid");
  await expect(panel(page, "Payment")).toBeVisible();
}

export interface ShipOptions {
  /** Checklist items whose label matches stay unticked, so the Buyer Pal's shipment check has something to say. */
  leaveUnticked?: RegExp;
}

/** Seller ticks the Seller Pal's checklist, adds the demo packing photos, uses the demo tracking number and ships. */
export async function shipAsSeller(page: Page, dealId: string, fixture: ScenarioFixture, options: ShipOptions = {}): Promise<void> {
  await openRoomAs(page, dealId, "seller");
  await expectState(page, "Paid");
  const step = panel(page, "Pack and ship");
  await expect(step).toBeVisible();

  const boxes = step.getByRole("checkbox");
  const count = await boxes.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    const label = ((await boxes.nth(i).locator("xpath=..").textContent()) ?? "").trim();
    if (options.leaveUnticked && options.leaveUnticked.test(label)) continue;
    await boxes.nth(i).check();
  }

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

/** Review, both sides agree, pay, ship, deliver. Leaves the buyer in a Delivered room with the arrival step open. */
export async function driveToDelivered(page: Page, dealId: string, fixture: ScenarioFixture, hooks: AgreeHooks = {}): Promise<void> {
  await expectState(page, "Listed");
  await reviewAndAgree(page, dealId, 1, hooks);
  await payWithDemoButtons(page, fixture.payment?.method === "venmo" ? "Venmo" : "PayPal");
  await shipAsSeller(page, dealId, fixture, hooks.ship);
  await confirmDelivery(page, dealId);
}

/**
 * The buyer approved the order in PayPal and comes back to capture it: the
 * order is created through the API (as the buttons do), the room then shows
 * the capture button, and one press moves the deal to Paid.
 */
export async function payByCaptureButton(page: Page, dealId: string): Promise<void> {
  const res = await page.request.post(`/api/deals/${dealId}/order`, { data: { method: "paypal" } });
  expect(res.ok(), `POST order -> ${res.status()}`).toBe(true);
  await openRoomAs(page, dealId, "buyer");
  await expectState(page, "Payment pending");
  const pay = panel(page, "Pay");
  await pay.getByRole("button", { name: "I approved in PayPal, capture now" }).click();
  await expectState(page, "Paid");
  await expect(panel(page, "Payment")).toBeVisible();
}
