/**
 * Starting a deal: from the demo picker (a fresh copy of a scenario) or from
 * the start form (either side pastes a listing). Both end in LISTED.
 */
import type { Deal, Party, Photo, ScenarioId } from "@pay-pals/contracts";
import { fixtureById } from "../../mocks/fixture-match";
import type { Role } from "../../role";
import type { Services } from "../../services";
import { FlowError } from "../errors";
import { note, say } from "./shared";

export interface StartDealInput {
  startedBy: Role;
  seller: Party;
  buyer: Party | null;
  listingText: string;
  sellerNotes: string;
  photos: Photo[];
  sellerPaypalEmail: string;
}

export async function startDeal(services: Services, input: StartDealInput): Promise<Deal> {
  await services.ready;
  const { store, sellerPal } = services;
  let deal = await store.createDeal({ seller: input.seller, buyer: input.buyer, scenario: null });
  const starter = input.startedBy === "seller" ? input.seller.displayName : (input.buyer?.displayName ?? "The buyer");
  await note(services, deal.id, "deal_created", input.startedBy, `${starter} started a deal.`);

  const built = await sellerPal.buildCard({
    dealId: deal.id,
    listingText: input.listingText,
    photos: input.photos,
    sellerNotes: input.sellerNotes,
    sellerPaypalEmail: input.sellerPaypalEmail,
  });
  await store.saveCard(built.data);
  await say(services, deal.id, "seller_pal", "seller_pal", built.palMessage);
  await note(services, deal.id, "card_updated", "seller_pal", `Seller Pal built card version ${built.data.version}.`);
  if (input.startedBy === "buyer") {
    await say(services, deal.id, "buyer_pal", "buyer_pal", "I sent the seller a link to this deal. Once they confirm the card, ask me to review it.");
  }
  deal = await store.transition(deal.id, "LISTED", "system", "Listed.");
  return deal;
}

/** A fresh copy of a scenario, in LISTED, with the scenario's chat already in the room. */
export async function startDemoDeal(services: Services, scenario: ScenarioId): Promise<Deal> {
  await services.ready;
  const fixture = fixtureById(scenario);
  const cardV1 = fixture?.cards[0];
  if (!fixture || !cardV1) throw new FlowError("Unknown scenario.", 404);
  const { store } = services;

  let deal = await store.createDeal({ seller: fixture.seller, buyer: fixture.buyer, scenario });
  await note(services, deal.id, "deal_created", "seller", `${fixture.seller.displayName} started a deal.`);
  await store.saveCard({ ...cardV1, dealId: deal.id, lockedAt: null });
  const serialNote = cardV1.serial ? `Serial ${cardV1.serial} read from the caseback photo.` : "No serial found in the photos.";
  await say(services, deal.id, "seller_pal", "seller_pal", `I built card version 1 from your listing. ${serialNote}`);
  await note(services, deal.id, "card_updated", "seller_pal", `Seller Pal built card version 1. ${serialNote}`);
  deal = await store.transition(deal.id, "LISTED", "system", "Listed.");
  for (const m of fixture.chat) {
    await store.addMessage({ dealId: deal.id, channel: m.channel, author: m.author, text: m.text, photos: m.photos.filter((p) => cardV1.photos.some((c) => c.url === p.url)), at: m.at });
  }
  await say(services, deal.id, "buyer_pal", "buyer_pal", "I have the card and the chat. Ask me to review before you agree to anything.");
  return deal;
}

export async function joinAsBuyer(services: Services, dealId: string, buyer: Party): Promise<Deal> {
  await services.ready;
  const deal = await services.store.getDeal(dealId);
  if (!deal) throw new FlowError("Deal not found.", 404);
  if (deal.buyer) throw new FlowError("This deal already has a buyer.", 409);
  const updated = await services.store.setBuyer(dealId, buyer);
  await say(services, dealId, "buyer_pal", "buyer_pal", `Hi ${buyer.displayName}. I will check this deal before any money moves. Ask me to review when you are ready.`);
  return updated;
}
