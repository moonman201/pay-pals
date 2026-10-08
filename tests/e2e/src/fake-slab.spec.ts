/**
 * Scenario 1: fake slab stopped. Buyer-started. The demo card replays the
 * invite and the seller's join, so the room opens at Listed with the invite
 * and the join on the timeline. The buyer asks for a review: the cert number
 * is registered as a different card, the seller asked for Friends and Family
 * and pushed for today, the price is far under market. Blocked, no override.
 * Fixtures only, no keys.
 */
import { expect, test } from "@playwright/test";
import { FAKE_SLAB_CERT, fakeSlab } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";
import { expectState, expectStateAfterPal, panel, pressAction, snapshot, startDemo } from "./helpers";

test.describe("fake slab stopped", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  test("the review blocks the deal: cert mismatch, Friends and Family, pressure and price", async ({ page }) => {
    const dealId = await startDemo(page, fakeSlab, "buyer");
    await expectState(page, "Listed");

    // Buyer-started: the invite went out, the seller joined, then the card was listed.
    const timeline = panel(page, "Timeline").getByRole("listitem");
    await expect(timeline.filter({ hasText: "Waiting for the seller." })).toHaveCount(1);
    await expect(timeline.filter({ hasText: `${fakeSlab.seller.displayName} joined the deal.` })).toHaveCount(1);
    await expect(timeline.filter({ hasText: "Listed." })).toHaveCount(1);
    const before = await snapshot(page, dealId);
    expect(before.deal.startedBy).toBe("buyer");
    expect(before.deal.sellerJoinedAt).not.toBeNull();

    const card = panel(page, "Item card");
    await expect(card.getByText("Cert number", { exact: true })).toBeVisible();
    await expect(card.getByText(FAKE_SLAB_CERT).first()).toBeVisible();

    await pressAction(page, "Ask my pal to review");
    await expectStateAfterPal(page, "Blocked");

    const review = panel(page, "Buyer Pal review");
    const flags = review.getByRole("list", { name: "Red flags" }).getByRole("listitem");
    // One payment flag that quotes the seller once (review item 6), marked as not overridable (item 13 wording).
    await expect(flags.filter({ hasText: /friends and family/i }).filter({ hasText: /no override/i })).toHaveCount(1);
    await expect(flags.filter({ hasText: /below market/i })).toHaveCount(1);
    await expect(flags.filter({ hasText: /pressure|urgen/i }).first()).toBeVisible();
    // The reused-photo flag quotes the slab label too, so the cert flag is the one that says the record does not match.
    const cert = flags.filter({ hasText: FAKE_SLAB_CERT }).filter({ hasText: "does not match the card" });
    await expect(cert).toHaveCount(1);
    await expect(cert).toContainText(/cert/i);
    await expect(cert).toContainText(fakeSlab.certRecord!.subject!);
    await expect(review.getByText("does not match the card").first()).toBeVisible();
    // The cert row on the item card names what the grader's record says, next to the cert number (review item 12).
    await expect(card.getByText(fakeSlab.certRecord!.subject!, { exact: false }).first()).toBeVisible();

    const next = panel(page, "Next step");
    await expect(next).toBeVisible();
    await expect(page.getByRole("button", { name: /^Agree/ })).toHaveCount(0);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(next.getByText("Goods and Services", { exact: false })).toBeVisible();
    await expect(timeline.last()).toContainText("Pay Pals will not move money outside a Goods and Services payment");

    const after = await snapshot(page, dealId);
    expect(after.deal.state).toBe("BLOCKED");
    expect(after.deal.lockedCardVersion).toBeNull();
  });
});
