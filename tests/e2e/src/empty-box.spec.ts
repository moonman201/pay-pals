/**
 * Scenario 3: an empty box arrives. Same path to Delivered, then the arrival
 * check finds no console to read a serial from, the buyer reports the issue
 * and the evidence page shows the locked card and the arrival photos.
 * Fixtures only, no keys.
 */
import { expect, test } from "@playwright/test";
import { EMPTY_BOX_LOCKED_SERIAL, emptyBox } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";
import { CONSOLE_PROOF_QUESTION, driveToDelivered, runArrivalCheck } from "./flows";
import { expectState, openRoomAs, panel, pressAction, snapshot, startDemo } from "./helpers";

/**
 * The arrived column says the item is not there, whether the pal saw the
 * photos or went by their descriptions.
 *
 * Corrected 2026-10-11, for the same reason as the sibling assertion in
 * tests/integration: this was a list of phrasings, and the phrasing changed
 * when builder-agents stopped the empty-box branch quoting a photo's caption
 * into `observed`, which had put AJ164952580 in the arrived column of a
 * comparison where nothing of the sort arrived. It became "no item in the
 * box, only packaging". Pin the claim rather than the words: the row says
 * something is absent, and it does not report the box label's number as
 * something that arrived.
 */
const MISSING = /\b(no|nothing|not)\b/i;

test.describe("empty box arrives", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  test("names the missing console against the locked card, opens an issue and builds the evidence pack", async ({ page }) => {
    const dealId = await startDemo(page, emptyBox, "buyer");
    // This seller never answers, so the card keeps the box label and never gains the console's own serial.
    const card = panel(page, "Item card");
    await expect(card.getByText(EMPTY_BOX_LOCKED_SERIAL).first()).toBeVisible();
    await expect(card.getByText("matches the console")).toHaveCount(0);

    // The seller ships without the required photo of the item going into the box (contracts v1.6.0).
    // The live Seller Pal words that step "going into the shipping box"; the fixture says "going into the box".
    await driveToDelivered(page, dealId, emptyBox, { ship: { leaveUnticked: /going into the (?:shipping )?box/i } });

    // Both rooms show the Buyer Pal's ship-time caution, and the timeline records the check.
    const shipmentCheck = page.getByRole("list", { name: "Buyer Pal shipment check" });
    await expect(shipmentCheck).toBeVisible();
    await expect(shipmentCheck.getByText("Buyer Pal:", { exact: true })).toBeVisible();
    await expect(shipmentCheck.getByText("caution", { exact: true })).toBeVisible();
    // Corrected 2026-10-11: this pinned the sentence "The seller shipped without the photo of the
    // item going into the box", which became "Shipped with no photo of the item going into the box."
    // The expectation was wrong, not the copy. What the check has to say is which photo is missing
    // and that it is the packing step, so that is what is pinned; the same stale sentence is still
    // in apps/web's own ShipmentSummary test, filed in REVIEW.md for builder-web.
    await expect(shipmentCheck).toContainText(/photo of the item going into the box/i);
    await expect(shipmentCheck).toContainText(/packing/i);
    await expect(panel(page, "Timeline").getByRole("listitem").filter({ hasText: "Buyer Pal shipment check" })).toHaveCount(1);
    await openRoomAs(page, dealId, "seller");
    await expect(page.getByRole("list", { name: "Buyer Pal shipment check" }).getByText("caution", { exact: true })).toBeVisible();
    await expect(panel(page, "Timeline").getByRole("listitem").filter({ hasText: "Buyer Pal shipment check" })).toHaveCount(1);
    await openRoomAs(page, dealId, "buyer");
    const shipped = await snapshot(page, dealId);
    expect(shipped.shipment?.flags?.map((f) => f.code)).toEqual(["MISSING_PACKING_PHOTO"]);
    expect(shipped.events.filter((e) => e.kind === "shipment_checked")).toHaveLength(1);
    // The Buyer Pal asks this seller for a close-up of the serial on the console; the seller never answers.
    const asked = shipped.verdict?.questionsForSeller ?? [];
    expect(asked.some((q) => CONSOLE_PROOF_QUESTION.test(q)), `asked: ${asked.join(" | ")}`).toBe(true);

    await runArrivalCheck(page, emptyBox);
    const result = panel(page, "Arrival check");
    await expect(result.getByText("does not match", { exact: true })).toBeVisible();
    // The locked card has no console serial, so nothing arriving can contradict one: the mismatch is
    // the item itself. The box label that did arrive is named and set aside, not counted as the console.
    const missingRow = result.getByRole("row").filter({ hasText: "other" });
    await expect(missingRow).toBeVisible();
    // The arrived cell, not the whole row: toContainText joins a row's cells with no separator, so
    // "...original box" + "no item..." reads as "boxno item" and a word-boundary match cannot see it.
    const arrived = missingRow.getByRole("cell").last();
    await expect(arrived).toContainText(MISSING);
    // The box label's number is not something that arrived, and it is the value that once got here.
    await expect(arrived).not.toContainText(EMPTY_BOX_LOCKED_SERIAL);
    // The serial row is still shown, as nothing to compare rather than as a contradiction.
    const serialRow = result.getByRole("row").filter({ hasText: "serial" });
    await expect(serialRow).toHaveCount(1);
    await expect(serialRow).not.toHaveAttribute("data-status", "mismatch");
    await expect(result).toContainText(EMPTY_BOX_LOCKED_SERIAL);
    await expect(result.getByText("does not count", { exact: false })).toBeVisible();

    // Open the issue. Today the room posts the arrival mismatch straight away after a failed
    // check; when the issue step opens instead, pick "The box arrived empty" (REVIEW.md 2026-10-07).
    await pressAction(page, "Report an issue");
    const issueStep = panel(page, "Report an issue");
    const stepOpened = await issueStep
      .waitFor({ state: "visible", timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (stepOpened) {
      await issueStep.getByRole("radio", { name: "The box arrived empty" }).check();
      await issueStep.getByRole("button", { name: "Open the issue" }).click();
    }
    await expectState(page, "Issue open");
    const issueLine = panel(page, "Timeline").getByRole("listitem").filter({ hasText: "Issue opened: what arrived does not match the locked card" });
    await expect(issueLine).toBeVisible();
    if (stepOpened) await expect(issueLine).toContainText("The box arrived empty.");

    const snap = await snapshot(page, dealId);
    expect(snap.deal.state).toBe("ISSUE");
    expect(snap.hasEvidence).toBe(true);

    await panel(page, "Next step").getByRole("link", { name: "Open the evidence pack" }).click();
    await expect(page).toHaveURL(new RegExp(`/deals/${dealId}/evidence\\?as=buyer$`));
    await expect(page.getByText("Pay Pals evidence pack")).toBeVisible();

    const lockedCard = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Locked item card, version \d+$/ }) });
    await expect(lockedCard).toBeVisible();
    await expect(lockedCard.getByText(EMPTY_BOX_LOCKED_SERIAL).first()).toBeVisible();
    // The box serial row is not on the evidence page yet (REVIEW.md 2026-10-07, builder-web); assert it here when it lands.

    const arrivalPhotos = page.locator("section").filter({ has: page.getByRole("heading", { name: `Buyer's arrival photos (${emptyBox.arrivalPhotos.length})` }) });
    await expect(arrivalPhotos).toBeVisible();
    await expect(arrivalPhotos.getByText("None.")).toHaveCount(0);

    const arrivalCheck = page.locator("section").filter({ has: page.getByRole("heading", { name: "Arrival check" }) });
    await expect(arrivalCheck).toContainText(EMPTY_BOX_LOCKED_SERIAL);
    // The pack has no comparison table, so there is no cell to read. Take what the check itself
    // recorded as the arrived side and require the page to show that, rather than a phrase this
    // test invents: the page and the record then cannot drift apart without one of them failing.
    const res = await page.request.get(`/api/deals/${dealId}`);
    expect(res.ok(), `GET the deal -> ${res.status()}`).toBe(true);
    const { arrivalCheck: recorded } = (await res.json()) as { arrivalCheck: { mismatches: { field: string; observed: string }[] } | null };
    const observed = recorded?.mismatches.find((m) => m.field === "other")?.observed;
    expect(observed, "the check recorded an 'other' difference").toBeTruthy();
    expect(observed, "and it says something is absent").toMatch(MISSING);
    await expect(arrivalCheck).toContainText(observed!);

    // What the seller never answered, and the ship-time caution, both in the pack.
    // Exactly one thing asked and never got: the close-up. The seller's "I agree" line is not an answer.
    const unanswered = page.locator("section").filter({ has: page.getByRole("heading", { name: "What the Buyer Pal asked and never got" }) });
    await expect(unanswered).toBeVisible();
    const list = unanswered.getByTestId("unanswered-questions");
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list.getByRole("listitem").first()).toContainText(CONSOLE_PROOF_QUESTION);
    await expect(unanswered.getByText("Nothing. Every question")).toHaveCount(0);
    const shipmentSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Shipment" }) });
    const evidenceCheck = shipmentSection.getByRole("list", { name: "Buyer Pal shipment check" });
    await expect(evidenceCheck.getByText("caution", { exact: true })).toBeVisible();
    // Same correction as the room's copy of this, above: the sentence changed, the claim did not.
    await expect(evidenceCheck).toContainText(/photo of the item going into the box/i);
    await expect(evidenceCheck).toContainText(/packing/i);
    await expect(page.locator("section").filter({ has: page.getByRole("heading", { name: "Summary" }) })).toContainText(/packing photo|going into the box/i);
  });
});
