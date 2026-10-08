/**
 * The seller answers a request from the buyer's side with a new card version.
 * A reviewed deal goes back to LISTED so the Buyer Pal can look again.
 */
import type { BuyerRequest, ItemCard, Photo } from "@pay-pals/contracts";
import type { Services } from "../../services";
import { absoluteCard, absolutePhotos, absoluteUrl } from "../photo-urls";
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

  const result = await services.sellerPal.applyRequest(absoluteCard(card), input.request, input.sellerReply, absolutePhotos(input.photos));
  // The pal saw absolute URLs; store the card with the photos as given (the old ones plus the new ones, in the pal's order).
  const relative = new Map([...card.photos, ...input.photos].map((p) => [absoluteUrl(p.url), p] as const));
  const saved = await services.store.saveCard({ ...result.data, photos: result.data.photos.map((p) => relative.get(p.url) ?? p) });
  await say(services, dealId, "seller_pal", "seller_pal", result.palMessage);
  await say(services, dealId, "deal", "seller", input.sellerReply || "Updated the card.", input.photos);
  await note(services, dealId, "card_updated", "seller_pal", `Card version ${saved.version}: ${input.request.field} updated.`);
  if (deal.state === "REVIEWED") {
    await services.store.transition(dealId, "LISTED", "system", "Card changed. It needs a fresh review.");
  }
  return saved;
}
