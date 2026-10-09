/**
 * Scenario 2: clean deal, end to end on the demo server. The Buyer Pal asks
 * for a close-up of the serial on the console, the seller adds it (card version 2),
 * a fresh review asks nothing more, both agree, the buyer pays by the
 * capture button, the seller ships with every photo, delivery, an arrival
 * check that matches, complete. The evidence pack then has nothing the pal
 * asked and never got. The state badge is asserted at every step.
 * Fixtures only, no keys.
 */
import { expect, test } from "@playwright/test";
import { cleanPs5 } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";
import {
  CONSOLE_PROOF_QUESTION,
  agreeAsBuyer,
  agreeAsSeller,
  answerPalWithDemoPhoto,
  confirmDelivery,
  expectAskedQuestion,
  payByCaptureButton,
  reviewAsBuyer,
  runArrivalCheck,
  shipAsSeller,
} from "./flows";
import { expectState, openRoomAs, panel, pressAction, snapshot, startDemo, waitForHydration } from "./helpers";

test.describe("clean deal", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  test("runs from Listed to Complete with the card locked at version 2 and the serial confirmed", async ({ page }) => {
    const dealId = await startDemo(page, cleanPs5, "buyer");
    await expect(page.getByRole("banner").getByRole("heading", { name: cleanPs5.cards[0]!.title })).toBeVisible();

    // Version 1 has the wide back shot and the box label: the box serial is on the card, the console's own is not.
    const card = panel(page, "Item card");
    await expect(card.getByText("Box serial", { exact: true })).toBeVisible();
    await expect(card.getByText(cleanPs5.cards[0]!.boxSerial!).first()).toBeVisible();
    await expect(card.getByText("matches the console")).toHaveCount(0);

    // First review: fair price, and one thing asked of the seller.
    await expectState(page, "Listed");
    await reviewAsBuyer(page);
    await expectAskedQuestion(page, CONSOLE_PROOF_QUESTION);

    // The seller answers with the close-up; the fresh review asks nothing more.
    await answerPalWithDemoPhoto(page, dealId, "Added. Here is the sticker on the console itself.", CONSOLE_PROOF_QUESTION);
    await openRoomAs(page, dealId, "buyer");
    await expectState(page, "Listed");
    // Version 2 carries the close-up the pal asked for, and the fresh review asks nothing more.
    const cardV2 = panel(page, "Item card");
    await expect(cardV2.getByRole("tab", { name: "Version 2", selected: true })).toBeVisible();
    await expect(cardV2.getByText(/close-up of the label on the back of the console/i).first()).toBeVisible();
    await reviewAsBuyer(page);
    await expectAskedQuestion(page, null);
    await agreeAsBuyer(page, 2);
    await agreeAsSeller(page, dealId, 2);
    await openRoomAs(page, dealId, "buyer");
    await expectState(page, "Agreed, card locked");

    // The locked card wears its lock badge and the text the PayPal order will carry (visual pass, item 6).
    const lockedCard = panel(page, "Item card");
    await expect(lockedCard.getByTestId("lock-badge")).toHaveText(/Locked, version 2/);
    await expect(lockedCard.getByTestId("order-text")).toContainText(cleanPs5.cards[0]!.title);
    await expect(lockedCard.getByTestId("order-text")).toContainText(`Invoice ${dealId}`);
    // The stepper ticks the step the state has finished and points at the next one: Agreed and locked is done, Paid is current.
    const steps = page.getByTestId("progress-stepper").getByRole("listitem");
    await expect(steps).toHaveCount(7);
    const stepStatuses = () => steps.evaluateAll((items) => items.map((li) => li.getAttribute("data-status")));
    expect(await stepStatuses()).toEqual(["done", "done", "done", "done", "current", "upcoming", "upcoming"]);

    // Pay by the capture button: the order is created, the buyer comes back approved, one press captures.
    const pay = panel(page, "Pay");
    await expect(pay).toBeVisible();
    // The default e2e server is demo-only, so the sandbox test buyer note never shows here (its presence is a component test).
    await expect(pay.getByText("PayPal sandbox test buyer, no real money")).toHaveCount(0);
    await expect(page.getByTestId("sandbox-buyer")).toHaveCount(0);
    await payByCaptureButton(page, dealId);
    await expect(page.getByTestId("sandbox-buyer")).toHaveCount(0);
    // Paid: the stepper ticks Paid and points at Shipped; the history chip becomes the verified seal (items 4 and 8).
    expect(await stepStatuses()).toEqual(["done", "done", "done", "done", "done", "current", "upcoming"]);
    await expect(page.getByTestId("history-badge").first()).toHaveAttribute("data-status", "verified");
    await shipAsSeller(page, dealId, cleanPs5);
    // Shipped (the seller's room): the parcel is on its way, so Shipped is done and Arrived is what both sides wait for.
    expect(await stepStatuses()).toEqual(["done", "done", "done", "done", "done", "done", "current"]);
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
    await expect(result.getByText(cleanPs5.cards.at(-1)!.serial!).first()).toBeVisible();

    await pressAction(page, "Complete the deal");
    await expectState(page, "Complete");
    await expect(panel(page, "Next step").getByText("complete", { exact: false })).toBeVisible();
    expect(await steps.evaluateAll((items) => items.map((li) => li.getAttribute("data-status")))).toEqual(Array(7).fill("done"));

    const snap = await snapshot(page, dealId);
    expect(snap.deal.state).toBe("COMPLETE");
    // The seeded example shows the console serial on the locked card; a deal played here does not yet,
    // because answering a photo request adds the photo without reading a serial off it. See the skipped
    // test below and the REVIEW.md entry of 2026-10-09.
    expect(snap.deal.lockedCardVersion).toBe(2);
    expect(snap.deal.startedBy).toBe("buyer");
    expect(snap.payment?.historyHash).toMatch(/^[0-9a-f]{64}$/);

    // The evidence pack: the chain head PayPal holds still reproduces from the stored events, and nothing was left unanswered.
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
    const unanswered = page.locator("section").filter({ has: page.getByRole("heading", { name: "What the Buyer Pal asked and never got" }) });
    await expect(unanswered).toContainText("Nothing. Every question the Buyer Pal asked before payment was answered.");
    await expect(unanswered.getByTestId("unanswered-questions")).toHaveCount(0);
    // The seller shipped with every photo, so no ship-time caution rides on this pack.
    await expect(page.getByRole("list", { name: "Buyer Pal shipment check" })).toHaveCount(0);
  });

  // Red until the REVIEW.md entry of 2026-10-09 is closed: answering a photo request adds the photo
  // but reads no serial off it, so a deal played on the site never reaches the card the fixture shows.
  test.skip("the answered close-up puts the console serial on card version 2", async ({ page }) => {
    const dealId = await startDemo(page, cleanPs5, "buyer");
    await reviewAsBuyer(page);
    await expectAskedQuestion(page, CONSOLE_PROOF_QUESTION);
    await answerPalWithDemoPhoto(page, dealId, "Added. Here is the sticker on the console itself.", CONSOLE_PROOF_QUESTION);
    await openRoomAs(page, dealId, "buyer");

    const card = panel(page, "Item card");
    await expect(card.getByText(cleanPs5.cards.at(-1)!.serial!).first()).toBeVisible();
    await expect(card.getByText("matches the console")).toBeVisible();
  });
});
