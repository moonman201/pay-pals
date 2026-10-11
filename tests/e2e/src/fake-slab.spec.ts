/**
 * Scenario 1: fake slab stopped. Buyer-started. The demo card replays the
 * invite and the seller's join, so the room opens at Listed with the invite
 * and the join on the timeline. The buyer asks for a review: the cert number
 * is real and matches the card, which shows the slab exists and not that this
 * seller has it, while the seller asked for Friends and Family, pushed for
 * today and priced it far under market. Blocked, no override.
 * Fixtures only, no keys.
 */
import { expect, test } from "@playwright/test";
import { FAKE_SLAB_CERT, fakeSlab } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";
import { expectState, expectStateAfterPal, panel, pressAction, snapshot, startDemo, timelineItems } from "./helpers";

test.describe("fake slab stopped", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  test("the review blocks the deal: Friends and Family, pressure and price, with the cert honestly reported", async ({ page }) => {
    const dealId = await startDemo(page, fakeSlab, "buyer");
    await expectState(page, "Listed");

    // Buyer-started: the invite went out, the seller joined, then the card was listed.
    const timeline = await timelineItems(page);
    await expect(timeline.filter({ hasText: "Waiting for the seller" })).toHaveCount(1);
    await expect(timeline.filter({ hasText: `${fakeSlab.seller.displayName} joined the deal.` })).toHaveCount(1);
    await expect(timeline.filter({ hasText: "Listed" }).first()).toBeVisible();
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
    // The cert is real and matches the card, so it raises nothing. The deal is stopped by the rest.
    await expect(flags.filter({ hasText: /does not match the card/i })).toHaveCount(0);
    // The cert block sits beside the review panel now rather than inside it, so it is found
    // on the page rather than scoped to that section.
    const certCheck = page.getByTestId("cert-check");
    await expect(certCheck).toContainText(FAKE_SLAB_CERT);
    // The headline says the finding in one line now, and the second half is the point: a
    // matching record shows the slab exists, not that this seller holds it.
    await expect(certCheck.getByTestId('cert-headline')).toContainText(/matches/i);
    await expect(certCheck.getByTestId('cert-headline')).toContainText(/doesn't prove|does not prove/i);
    // A real cert is not a reason to trust the seller, and the panel says which of the two it
    // is. The words changed with Matt's pass; the claim is what is pinned.
    await expect(review).toContainText(/slab exists/i);
    await expect(review).toContainText(/doesn't prove the seller has it|not that this seller/i);
    // The cert row on the item card says what the grader's record did, next to the cert number (review item 12).
    const certRow = card.locator("dd").filter({ hasText: FAKE_SLAB_CERT });
    await expect(certRow).toHaveCount(1);
    await expect(certRow).toContainText(/record agrees/i);
    // The comparison in the review is where the record's own words belong.
    await expect(certCheck).toContainText(fakeSlab.certRecord!.grade!);

    // What the seller will not do is a question, not a flag: the slab photographed next to a dated note.
    await expect(review.getByText("Asked of the seller", { exact: true })).toBeVisible();
    await expect(review.getByRole("listitem").filter({ hasText: /handwritten note with your name and today'?s date/i })).toHaveCount(1);

    // J4: the page never shows a range with equal ends or zeros.
    await expect(page.getByText(/\$0 to \$0/)).toHaveCount(0);
    expect(((await page.locator("main").textContent()) ?? "")).not.toMatch(/\$(\d[\d,]*(?:\.\d+)?) to \$\1\b/);

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
