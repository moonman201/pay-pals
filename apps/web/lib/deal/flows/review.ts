/**
 * The Buyer Pal review, and what follows from it. A payment-method flag
 * (Friends and Family, off-platform, a refused invite) ends the deal on the
 * spot (Decision 1 and 7); everything else waits for the buyer.
 *
 * In INVITED there is no card yet: the pal reviews the chat and the refusal
 * alone, and the deal moves INVITED -> REVIEWED (-> BLOCKED on a refusal).
 */
import { isPaymentMethodFlag, type Deal, type DealEvent, type ReviewContext, type Verdict } from "@pay-pals/contracts";
import type { Services } from "../../services";
import { FlowError } from "../errors";
import { expectState, mustDeal, note, say } from "./shared";

export const BLOCK_SUMMARY = "Blocked. Pay Pals will not move money outside a Goods and Services payment.";

export function wasInviteDeclined(events: readonly DealEvent[]): boolean {
  return events.some((e) => e.kind === "invite_declined");
}

/** Everything the Buyer Pal should know beyond the card and the chat. Built the same way for every review. */
export function reviewContext(deal: Deal, events: readonly DealEvent[]): ReviewContext {
  return {
    dealId: deal.id,
    seller: deal.seller,
    listingUrl: deal.listingUrl,
    sellerJoined: deal.sellerJoinedAt !== null,
    inviteDeclined: wasInviteDeclined(events),
  };
}

export async function runReview(services: Services, dealId: string): Promise<Verdict> {
  let deal = await mustDeal(services, dealId);
  expectState(deal, "LISTED", "INVITED");
  const { store } = services;
  const card = await store.getCurrentCard(dealId);
  const [chat, events] = await Promise.all([store.listMessages(dealId, "deal"), store.listEvents(dealId)]);
  if (deal.state === "INVITED" && chat.length === 0 && !wasInviteDeclined(events)) {
    throw new FlowError("There is nothing to review yet. Paste the seller's reply in the chat, or wait for them to join.", 409);
  }

  const result = await services.buyerPal.review(card, chat, reviewContext(deal, events));
  const verdict = await store.saveVerdict(result.data);
  await say(services, dealId, "buyer_pal", "buyer_pal", result.palMessage);
  const what = card ? `card version ${card.version}` : "the seller's reply, with no card";
  await note(services, dealId, "review_posted", "buyer_pal", `Buyer Pal reviewed ${what}: ${verdict.overall}.`);
  deal = await store.transition(dealId, "REVIEWED", "system", "Reviewed.");

  if (verdict.questionsForSeller.length > 0 && card) {
    const asks = verdict.questionsForSeller.map((q) => `"${q}"`).join(" ");
    await say(services, dealId, "seller_pal", "seller_pal", `The buyer's pal asked for something before they commit: ${asks} Add it below and I will save a new card version.`);
    await say(services, dealId, "deal", "buyer_pal", `Buyer Pal to seller: ${verdict.questionsForSeller.join(" ")}`);
  }

  if (verdict.flags.some(isPaymentMethodFlag)) {
    await store.transition(dealId, "BLOCKED", "buyer_pal", BLOCK_SUMMARY);
    await say(services, dealId, "deal", "buyer_pal", BLOCK_SUMMARY + " No order was created and no money moved.");
  }
  return verdict;
}
