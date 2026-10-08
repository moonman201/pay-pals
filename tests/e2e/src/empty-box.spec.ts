/**
 * Scenario 3: an empty box arrives. Same path to Delivered, then the arrival
 * check finds no console to read a serial from, the buyer reports the issue
 * and the evidence page shows the locked card and the arrival photos.
 * Fixtures only, no keys.
 */
import { expect, test } from "@playwright/test";
import { EMPTY_BOX_LOCKED_SERIAL, emptyBox } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";
import { driveToDelivered, runArrivalCheck } from "./flows";
import { expectState, panel, pressAction, snapshot, startDemo } from "./helpers";

/** Vision wording, once the photos exist and a key is present. */
const NOT_PRESENT = "not present, box arrived empty";
/** Keyless wording: the serial could not be read, still a mismatch (review item 2). */
const NOT_READABLE = "not readable in the arrival photos";
const MISSING = new RegExp(`${NOT_PRESENT}|${NOT_READABLE}`);

test.describe("empty box arrives", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  test("names the missing console against the locked serial, opens an issue and builds the evidence pack", async ({ page }) => {
    const dealId = await startDemo(page, emptyBox, "buyer");
    await expect(panel(page, "Item card").getByText("matches the console")).toBeVisible();
    await driveToDelivered(page, dealId, emptyBox);

    await runArrivalCheck(page, emptyBox);
    const result = panel(page, "Arrival check");
    await expect(result.getByText("does not match", { exact: true })).toBeVisible();
    const serialRow = result.getByRole("row").filter({ hasText: "serial" });
    await expect(serialRow).toContainText(EMPTY_BOX_LOCKED_SERIAL);
    await expect(serialRow).toContainText(MISSING);
    const sawEmptyBox = ((await serialRow.textContent()) ?? "").includes(NOT_PRESENT);
    if (sawEmptyBox) {
      await expect(result.getByRole("row").filter({ hasText: "other" })).toBeVisible();
      await expect(result.getByText("without the item", { exact: false })).toBeVisible();
    } else {
      await expect(result.getByText("does not count", { exact: false })).toBeVisible();
    }

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
    await expect(arrivalCheck).toContainText(MISSING);
  });
});
