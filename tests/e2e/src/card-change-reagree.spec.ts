/**
 * A card change after one side agreed sends the deal back for a fresh review
 * and clears the agreement. Clean deal as buyer: review, buyer agrees, the
 * seller adds the battery photo (card version 2), the deal reads Listed
 * again, the buyer reviews and agrees again, the seller agrees, locked at
 * version 2. Fixtures only, no keys.
 */
import { expect, test } from "@playwright/test";
import { cleanGarmin } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";
import { agreeAsBuyer, agreeAsSeller, reviewAsBuyer } from "./flows";
import { addAllDemoPhotos, expectState, openRoomAs, panel, snapshot, startDemo } from "./helpers";

test.describe("card change after one side agreed", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  test("needs a fresh review and fresh agreement from both sides, then locks version 2", async ({ page }) => {
    const dealId = await startDemo(page, cleanGarmin, "buyer");
    await expectState(page, "Listed");
    await reviewAsBuyer(page);
    await agreeAsBuyer(page, 1);

    // Seller updates the card instead of agreeing.
    await openRoomAs(page, dealId, "seller");
    await expectState(page, "Reviewed");
    await expect(panel(page, "Next step").getByText("The buyer has agreed to version 1.")).toBeVisible();
    const step = panel(page, /^(Update the card|Answer the buyer's pal)$/);
    await expect(step).toBeVisible();
    const open = step.getByRole("button", { name: "Add a photo or note" });
    if ((await open.count()) > 0) await open.click();
    await addAllDemoPhotos(step);
    await step.getByLabel("Your reply").fill("Added. About 11 days in smartwatch mode.");
    await step.getByRole("button", { name: "Save a new card version" }).click();

    await expectState(page, "Listed");
    await expect(panel(page, "Item card").getByRole("tab", { name: "Version 2" })).toBeVisible();
    await expect(panel(page, "Timeline").getByRole("listitem").filter({ hasText: "Card changed. It needs a fresh review." })).toBeVisible();

    // Buyer: the earlier review is stale, there is nothing to agree to yet.
    await openRoomAs(page, dealId, "buyer");
    await expectState(page, "Listed");
    await expect(panel(page, "Buyer Pal review").getByText("This review was for card version 1. The card is now version 2, so it needs another look.")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Agree/ })).toHaveCount(0);
    const before = await snapshot(page, dealId);
    expect(before.deal.state).toBe("LISTED");
    expect(before.deal.lockedCardVersion).toBeNull();

    await reviewAsBuyer(page);
    await expect(panel(page, "Next step").getByText("Card changed since you agreed. Read version 2 and agree again.")).toBeVisible();
    await agreeAsBuyer(page, 2);
    await agreeAsSeller(page, dealId, 2);

    // Three agreements in all: the buyer to version 1 (the seller changed the card instead), then both to version 2.
    const agreedLines = panel(page, "Timeline").getByRole("listitem").filter({ hasText: "agreed to card version" });
    await expect(agreedLines).toHaveCount(3);
    await expect(agreedLines.filter({ hasText: "The buyer agreed to card version 1." })).toHaveCount(1);
    await expect(agreedLines.filter({ hasText: "card version 2." })).toHaveCount(2);

    const after = await snapshot(page, dealId);
    expect(after.deal.state).toBe("AGREED");
    expect(after.deal.lockedCardVersion).toBe(2);
  });
});
