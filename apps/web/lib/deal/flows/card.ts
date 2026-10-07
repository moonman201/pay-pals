/**
 * The seller answers a request from the buyer's side with a new card version.
 * A reviewed deal goes back to LISTED so the Buyer Pal can look again.
 */
import type { BuyerRequest, ItemCard, Photo } from "@pay-pals/contracts";
import type { Services } from "../../services";
import { expectState, mustCurrentCard, mustDeal, note, say } from "./shared";

export interface ApplyRequestInput {
  request: BuyerRequest;
  sellerReply: string;
  photos: Photo[];
}

export async function applyBuyerRequest(services: Services, dealId: string, input: ApplyRequestInput): Promise<ItemCard> {
  const deal = await mustDeal(services, dealId);
  expectState(deal, "LISTED", "REVIEWED");
  const card = await mustCurrentCard(services, dealId);

  const result = await services.sellerPal.applyRequest(card, input.request, input.sellerReply, input.photos);
  const saved = await services.store.saveCard(result.data);
  await say(services, dealId, "seller_pal", "seller_pal", result.palMessage);
  await say(services, dealId, "deal", "seller", input.sellerReply || "Updated the card.", input.photos);
  await note(services, dealId, "card_updated", "seller_pal", `Card version ${saved.version}: ${input.request.field} updated.`);
  if (deal.state === "REVIEWED") {
    await services.store.transition(dealId, "LISTED", "system", "Card changed. It needs a fresh review.");
  }
  return saved;
}
