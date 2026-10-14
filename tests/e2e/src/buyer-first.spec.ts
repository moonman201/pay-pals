/**
 * The main way in. A buyer taps "Use Pay Pals Protection" on the landing
 * page with the seller's PayPal email and the listing link, lands in a room
 * that waits for the seller with the invite link to send, then the seller
 * opens that link, joins with the listing text and a photo, and the deal
 * reads Listed. Fixtures only, no keys.
 */
import { expect, test } from "./fixtures";
import { cleanPs5 } from "@pay-pals/contracts";
import { WEB_PRESENT } from "./env";
import { joinAsSeller } from "./flows";
import { dealFacts, expectState, joinPath, panel, snapshot, startBuyerFirst, timelineItems } from "./helpers";

const LISTING_URL = "https://marketplace.example/listings/5120";

test.describe("buyer-first start", () => {
  test.skip(!WEB_PRESENT, "apps/web is not on this branch yet, nothing to load");

  test("the invite panel waits for the seller, and the seller joins through the link", async ({ page }) => {
    const dealId = await startBuyerFirst(page, {
      sellerEmail: cleanPs5.seller.email,
      listingUrl: LISTING_URL,
      buyerName: cleanPs5.buyer.displayName,
      buyerEmail: cleanPs5.buyer.email,
    });

    // The buyer's room: no card yet, waiting on the seller, with the link to send.
    await expectState(page, "Waiting for the seller");
    await expect(page.getByRole("banner").getByRole("heading", { name: "New deal" })).toBeVisible();
    await expect(dealFacts(page).getByText(`You are the buyer, ${cleanPs5.buyer.displayName}`, { exact: false })).toBeVisible();
    await expect(panel(page, "Item card")).toHaveCount(0);

    const invite = panel(page, "Send this link to the seller");
    await expect(invite).toBeVisible();
    await expect(invite.getByText(cleanPs5.seller.email, { exact: false })).toBeVisible();
    const link = invite.getByRole("textbox", { name: "Invite link for the seller" });
    await expect(link).toHaveValue(new RegExp(`${joinPath(dealId).replace(/[?]/g, "\\?")}$`));
    await expect(invite.getByRole("link", { name: LISTING_URL })).toHaveAttribute("href", LISTING_URL);
    await expect(panel(page, "Next step").getByRole("link", { name: "seller's join page" })).toHaveAttribute("href", joinPath(dealId));
    await expect(page.getByRole("button", { name: /^Agree/ })).toHaveCount(0);

    const timeline = await timelineItems(page);
    await expect(timeline.filter({ hasText: "invited the seller" })).toHaveCount(1);
    await expect(timeline.filter({ hasText: "Invite link created for the seller" })).toHaveCount(1);
    // State changes fold into the action that caused them now, with the new state on the end
    // of that row, so there is no row of its own saying it. The state is still on the page and
    // still in the timeline; this reads it where it now lives.
    await expect(timeline.filter({ hasText: "Waiting for the seller" })).toHaveCount(1);
    // A fresh deal started here is a real deal, not a seeded example (J6).
    await expect(page.getByText("Example deal, seeded from a scenario")).toHaveCount(0);

    const invited = await snapshot(page, dealId);
    expect(invited.deal.state).toBe("INVITED");
    expect(invited.deal.startedBy).toBe("buyer");
    expect(invited.deal.listingUrl).toBe(LISTING_URL);
    expect(invited.deal.sellerJoinedAt).toBeNull();
    expect(invited.deal.currentCardVersion).toBe(0);

    // J8: no dev-only copy on the pages a seller or a buyer starts from.
    await page.goto(joinPath(dealId));
    await expect(page.getByText(/local dev only/i)).toHaveCount(0);
    await page.goto("/deals/new");
    await expect(page.getByText(/local dev only/i)).toHaveCount(0);

    // The seller opens the invite link, joins, and their pal builds the card.
    await joinAsSeller(page, dealId, cleanPs5);
    await expect(dealFacts(page).getByText(`You are the seller, ${cleanPs5.seller.displayName}`, { exact: false })).toBeVisible();
    await expect(panel(page, "Item card")).toBeVisible();
    await expect(panel(page, "Item card").getByText("Version 1, draft")).toBeVisible();
    const after = await timelineItems(page);
    await expect(after.filter({ hasText: `${cleanPs5.seller.displayName} joined the deal.` })).toHaveCount(1);
    await expect(after.filter({ hasText: "Seller Pal built card version 1." })).toHaveCount(1);
    await expect(after.filter({ hasText: "Listed" }).first()).toBeVisible();

    const listed = await snapshot(page, dealId);
    expect(listed.deal.state).toBe("LISTED");
    expect(listed.deal.sellerJoinedAt).not.toBeNull();
    expect(listed.deal.currentCardVersion).toBe(1);

    // The invite link is spent: it now opens the seller's room.
    await page.goto(joinPath(dealId));
    await expect(page).toHaveURL(new RegExp(`/deals/${dealId}\\?as=seller$`));
  });
});
