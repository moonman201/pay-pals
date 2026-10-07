/**
 * The Buyer Pal review, and what follows from it. A payment-method flag
 * ends the deal on the spot (Decision 1); everything else waits for the buyer.
 */
import { isPaymentMethodFlag, type Verdict } from "@pay-pals/contracts";
import type { Services } from "../../services";
import { expectState, mustCurrentCard, mustDeal, note, say } from "./shared";

export const BLOCK_SUMMARY = "Blocked. Pay Pals will not move money outside a Goods and Services payment.";

export async function runReview(services: Services, dealId: string): Promise<Verdict> {
  let deal = await mustDeal(services, dealId);
  expectState(deal, "LISTED");
  const card = await mustCurrentCard(services, dealId);
  const chat = await services.store.listMessages(dealId, "deal");

  const result = await services.buyerPal.review(card, chat, { seller: deal.seller });
  const verdict = await services.store.saveVerdict(result.data);
  await say(services, dealId, "buyer_pal", "buyer_pal", result.palMessage);
  await note(services, dealId, "review_posted", "buyer_pal", `Buyer Pal reviewed card version ${card.version}: ${verdict.overall}.`);
  deal = await services.store.transition(dealId, "REVIEWED", "system", "Reviewed.");

  if (verdict.questionsForSeller.length > 0) {
    const asks = verdict.questionsForSeller.map((q) => `"${q}"`).join(" ");
    await say(services, dealId, "seller_pal", "seller_pal", `The buyer's pal asked for something before they commit: ${asks} Add it below and I will save a new card version.`);
    await say(services, dealId, "deal", "buyer_pal", `Buyer Pal to seller: ${verdict.questionsForSeller.join(" ")}`);
  }

  if (verdict.flags.some(isPaymentMethodFlag)) {
    await services.store.transition(dealId, "BLOCKED", "buyer_pal", BLOCK_SUMMARY);
    await say(services, dealId, "deal", "buyer_pal", BLOCK_SUMMARY + " No order was created and no money moved.");
  }
  return verdict;
}
