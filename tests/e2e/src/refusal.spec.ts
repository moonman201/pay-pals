/**
 * A refused invite is the strongest scam sign. The buyer starts a deal, the
 * seller opens the invite link and says they will not use Pay Pals, and the
 * Buyer Pal reviews the refusal with no card at all: INVITE_REFUSED, a
 * payment-method stop, no override, Blocked. Fixtures only, no keys.
 */
import { expect, test } from "@playwright/test";
import { fakeSlab } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";
import { PAL_TIMEOUT, expectState, expectStateAfterPal, joinPath, openRoomAs, panel, pressAction, snapshot, startBuyerFirst, waitForHydration } from "./helpers";

const REASON = "Friends and Family only, I am not paying fees.";

test.describe("seller refuses the invite", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  test("the Buyer Pal reviews the refusal with no card and blocks the deal", async ({ page }) => {
    const dealId = await startBuyerFirst(page, {
      sellerEmail: fakeSlab.seller.email,
      listingUrl: fakeSlab.deal.listingUrl!,
      buyerName: fakeSlab.buyer.displayName,
      buyerEmail: fakeSlab.buyer.email,
    });
    await expectState(page, "Waiting for the seller");

    // The seller opens the invite link and declines, with a reason.
    await page.goto(joinPath(dealId));
    await waitForHydration(page);
    await page.getByRole("button", { name: "I will not use Pay Pals" }).click();
    await expect(page.getByText("You will not use Pay Pals for this deal.")).toBeVisible();
    await page.getByLabel("Tell the buyer why (optional)").fill(REASON);
    await page.getByRole("button", { name: "Record that I will not use Pay Pals" }).click();
    await expect(page.getByText("You chose not to use Pay Pals for this deal. The buyer has been told.")).toBeVisible({ timeout: PAL_TIMEOUT });

    const declined = await snapshot(page, dealId);
    expect(declined.deal.state).toBe("INVITED");
    expect(declined.inviteDeclined).toBe(true);
    expect(declined.deal.sellerJoinedAt).toBeNull();

    // Back in the buyer's room: still no card, the refusal is on the record, the pal can review it.
    await openRoomAs(page, dealId, "buyer");
    await expectState(page, "Waiting for the seller");
    await expect(panel(page, "Item card")).toHaveCount(0);
    const timeline = panel(page, "Timeline").getByRole("listitem");
    const declinedLine = timeline.filter({ hasText: "declined Pay Pals protection" });
    await expect(declinedLine).toHaveCount(1);
    await expect(declinedLine).toContainText(REASON);
    const next = panel(page, "Next step");
    await expect(next.getByText("The seller has not joined. Ask your pal to review what they said", { exact: false })).toBeVisible();

    await pressAction(page, "Ask my pal to review the refusal");
    await expectStateAfterPal(page, "Blocked");

    const review = panel(page, "Buyer Pal review");
    await expect(review.getByText("Stop", { exact: true })).toBeVisible();
    const flags = review.getByRole("list", { name: "Red flags" }).getByRole("listitem");
    const refused = flags.filter({ hasText: "refused Pay Pals protection" });
    await expect(refused).toHaveCount(1);
    await expect(refused).toContainText(/no override/i);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Agree/ })).toHaveCount(0);
    await expect(panel(page, "Item card")).toHaveCount(0);
    await expect(panel(page, "Next step").getByText("Goods and Services", { exact: false })).toBeVisible();
    await expect(timeline.last()).toContainText("Pay Pals will not move money outside a Goods and Services payment");

    const blocked = await snapshot(page, dealId);
    expect(blocked.deal.state).toBe("BLOCKED");
    expect(blocked.deal.currentCardVersion).toBe(0);
    expect(blocked.deal.lockedCardVersion).toBeNull();

    // The spent invite link no longer offers the join form.
    await page.goto(joinPath(dealId));
    await expect(page).toHaveURL(new RegExp(`/deals/${dealId}\\?as=seller$`));
  });
});
