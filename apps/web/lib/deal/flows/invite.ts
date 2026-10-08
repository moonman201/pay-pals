/**
 * Buyer-first deals (PLAN.md Decision 7). The buyer taps "Use Pay Pals
 * Protection" with the seller's PayPal email and the listing link; the deal
 * waits in INVITED until the seller joins with photos (Seller Pal builds the
 * card, LISTED) or declines (recorded, then the Buyer Pal reviews the refusal).
 */
import type { Deal, Party, Photo } from "@pay-pals/contracts";
import type { Role } from "../../role";
import type { Services } from "../../services";
import { FlowError } from "../errors";
import { absolutePhotos } from "../photo-urls";
import { expectState, mustDeal, note, say } from "./shared";

export interface InviteInput {
  buyer: Pick<Party, "displayName" | "email">;
  sellerEmail: string;
  listingUrl: string | null;
}

/** Seller display name until they join: the local part of their PayPal email. */
export function nameFromEmail(email: string): string {
  return email.split("@")[0]?.trim() || "Seller";
}

export async function startBuyerFirst(services: Services, input: InviteInput): Promise<Deal> {
  await services.ready;
  const { store } = services;
  const seller: Party = { role: "seller", email: input.sellerEmail, displayName: nameFromEmail(input.sellerEmail) };
  const buyer: Party = { role: "buyer", ...input.buyer };
  let deal = await store.createDeal({ startedBy: "buyer", seller, buyer, listingUrl: input.listingUrl, scenario: null });
  await note(services, deal.id, "deal_created", "buyer", `${buyer.displayName} started a deal from a listing and invited the seller.`);
  await note(services, deal.id, "seller_invited", "system", "Invite link created for the seller. The buyer sends it.");
  deal = await store.transition(deal.id, "INVITED", "system", "Waiting for the seller.");
  await say(
    services,
    deal.id,
    "buyer_pal",
    "buyer_pal",
    "Send the seller the invite link. When they join and add photos, their pal builds the item card and I review it before any money moves. If they refuse and ask for Friends and Family instead, paste their reply in the chat and ask me to review it.",
  );
  return deal;
}

export interface SellerJoinInput {
  displayName: string;
  sellerPaypalEmail: string;
  listingText: string;
  sellerNotes: string;
  photos: Photo[];
  askingPrice?: number;
}

/** A deal the seller can still join: invited, or reviewed from the chat alone with no card yet. */
export function canSellerJoin(deal: Deal): boolean {
  return deal.state === "INVITED" || (deal.state === "REVIEWED" && deal.currentCardVersion === 0);
}

export async function sellerJoin(services: Services, dealId: string, input: SellerJoinInput): Promise<Deal> {
  let deal = await mustDeal(services, dealId);
  if (!canSellerJoin(deal)) throw new FlowError(`The seller cannot join while the deal is ${deal.state}.`, 409);
  const { store, sellerPal } = services;

  // The store sets sellerJoinedAt and appends seller_joined.
  deal = await store.markSellerJoined(dealId, { displayName: input.displayName.trim() || deal.seller.displayName, email: input.sellerPaypalEmail });
  const built = await sellerPal.buildCard({
    dealId,
    listingText: input.listingText,
    photos: absolutePhotos(input.photos),
    sellerNotes: input.sellerNotes,
    sellerPaypalEmail: input.sellerPaypalEmail,
    askingPrice: input.askingPrice,
  });
  // The pal saw absolute URLs; the stored card keeps the photos as given so the pages keep working anywhere.
  await store.saveCard({ ...built.data, photos: input.photos });
  await say(services, dealId, "seller_pal", "seller_pal", built.palMessage);
  await note(services, dealId, "card_updated", "seller_pal", `Seller Pal built card version ${built.data.version}.`);
  await say(services, dealId, "buyer_pal", "buyer_pal", `${deal.seller.displayName} joined and their pal built the item card. Ask me to review it before you agree to anything.`);
  return store.transition(dealId, "LISTED", "system", "Listed.");
}

export interface DeclineInput {
  by: Role;
  reason: string;
}

/** The seller will not use Pay Pals (said on the join page, or relayed by the buyer). The Buyer Pal reviews it next. */
export async function declineInvite(services: Services, dealId: string, input: DeclineInput): Promise<Deal> {
  const deal = await mustDeal(services, dealId);
  expectState(deal, "INVITED");
  const reason = input.reason.trim();
  const who = input.by === "seller" ? deal.seller.displayName : `${deal.buyer?.displayName ?? "The buyer"} says the seller`;
  await note(services, dealId, "invite_declined", input.by, `${who} declined Pay Pals protection.${reason ? ` Reason given: ${reason}` : ""}`.slice(0, 300), { reason });
  if (reason) await say(services, dealId, "deal", input.by, input.by === "seller" ? reason : `The seller replied: ${reason}`);
  await say(services, dealId, "buyer_pal", "buyer_pal", "The seller declined Pay Pals protection. Ask me to review the refusal before you do anything else.");
  return deal;
}
