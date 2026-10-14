/**
 * A card change after one side agreed sends the deal back for a fresh review
 * and clears the agreement. Clean deal as buyer: review (the pal asks for the
 * Console Information screen), buyer agrees, the seller answers with that
 * photo (card version 2), the deal reads Listed again, the buyer reviews and
 * agrees again, the seller agrees, locked at version 2. Fixtures only, no keys.
 */
import { expect, test } from "./fixtures";
import { cleanPs5 } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";
import { CONSOLE_PROOF_QUESTION, agreeAsBuyer, agreeAsSeller, answerPalWithDemoPhoto, expectAskedQuestion, reviewAsBuyer } from "./flows";
import { expectState, openRoomAs, panel, snapshot, startDemo, timelineItems } from "./helpers";

test.describe("card change after one side agreed", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  test("needs a fresh review and fresh agreement from both sides, then locks version 2", async ({ page }) => {
    const dealId = await startDemo(page, cleanPs5, "buyer");
    await expectState(page, "Listed");
    await reviewAsBuyer(page);
    await expectAskedQuestion(page, CONSOLE_PROOF_QUESTION);
    await agreeAsBuyer(page, 1);

    // Seller answers the pal with the screen photo instead of agreeing.
    await answerPalWithDemoPhoto(page, dealId, "Added. Same serial on the screen, software is current.", CONSOLE_PROOF_QUESTION);
    await expect(panel(page, "Next step").getByText("The buyer has agreed to version 1.")).toHaveCount(0);

    // Buyer: the earlier review is stale, there is nothing to agree to yet.
    await openRoomAs(page, dealId, "buyer");
    await expectState(page, "Listed");
    await expect(panel(page, "Buyer Pal review").getByText("This review was for card version 1. The card is now version 2, so it needs another look.")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Agree/ })).toHaveCount(0);
    const before = await snapshot(page, dealId);
    expect(before.deal.state).toBe("LISTED");
    expect(before.deal.lockedCardVersion).toBeNull();

    await reviewAsBuyer(page);
    await expectAskedQuestion(page, null);
    await expect(panel(page, "Next step").getByText("Card changed since you agreed. Read version 2 and agree again.")).toBeVisible();
    await agreeAsBuyer(page, 2);
    await agreeAsSeller(page, dealId, 2);

    // Three agreements in all: the buyer to version 1 (the seller changed the card instead), then both to version 2.
    const agreedLines = (await timelineItems(page)).filter({ hasText: "agreed to card version" });
    await expect(agreedLines).toHaveCount(3);
    await expect(agreedLines.filter({ hasText: "The buyer agreed to card version 1." })).toHaveCount(1);
    await expect(agreedLines.filter({ hasText: "card version 2." })).toHaveCount(2);

    const after = await snapshot(page, dealId);
    expect(after.deal.state).toBe("AGREED");
    expect(after.deal.lockedCardVersion).toBe(2);
  });
});
