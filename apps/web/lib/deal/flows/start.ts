/**
 * Starting a deal: from the demo picker (a fresh copy of a scenario) or from
 * the seller's start form. Buyer-first starts live in invite.ts.
 */
import type { Deal, Party, Photo, ScenarioFixture, ScenarioId } from "@pay-pals/contracts";
import { fixtureById } from "../../scenarios";
import type { Services } from "../../services";
import { FlowError } from "../errors";
import { note, say } from "./shared";

export interface StartDealInput {
  seller: Party;
  listingText: string;
  sellerNotes: string;
  photos: Photo[];
  sellerPaypalEmail: string;
  /** Typed by the seller when the listing text names no price. */
  askingPrice?: number;
}

/** The seller lists first and shares the link. Secondary path; buyers usually start with an invite. */
export async function startDeal(services: Services, input: StartDealInput): Promise<Deal> {
  await services.ready;
  const { store, sellerPal } = services;
  let deal = await store.createDeal({ startedBy: "seller", seller: input.seller, buyer: null, listingUrl: null, scenario: null });
  await note(services, deal.id, "deal_created", "seller", `${input.seller.displayName} started a deal.`);

  const built = await sellerPal.buildCard({
    dealId: deal.id,
    listingText: input.listingText,
    photos: input.photos,
    sellerNotes: input.sellerNotes,
    sellerPaypalEmail: input.sellerPaypalEmail,
    askingPrice: input.askingPrice,
  });
  await store.saveCard(built.data);
  await say(services, deal.id, "seller_pal", "seller_pal", built.palMessage);
  await note(services, deal.id, "card_updated", "seller_pal", `Seller Pal built card version ${built.data.version}.`);
  deal = await store.transition(deal.id, "LISTED", "system", "Listed.");
  return deal;
}

/** The fixture chat up to the first Buyer Pal review. Everything later belongs to steps the demo has not reached. */
export function preReviewChat(fixture: ScenarioFixture): ScenarioFixture["chat"] {
  const firstReview = fixture.timeline.find((e) => e.kind === "review_posted")?.at;
  return firstReview ? fixture.chat.filter((m) => m.at < firstReview) : fixture.chat;
}

/**
 * A fresh copy of a scenario, in LISTED, with the scenario's pre-review chat
 * already in the room. Buyer-started fixtures replay the invite and the join
 * first, the way their timeline does.
 */
export async function startDemoDeal(services: Services, scenario: ScenarioId): Promise<Deal> {
  await services.ready;
  const fixture = fixtureById(scenario);
  const cardV1 = fixture?.cards[0];
  if (!fixture || !cardV1) throw new FlowError("Unknown scenario.", 404);
  const { store } = services;
  const buyerFirst = fixture.deal.startedBy === "buyer";

  let deal = await store.createDeal({
    startedBy: fixture.deal.startedBy,
    seller: fixture.seller,
    buyer: fixture.buyer,
    listingUrl: fixture.deal.listingUrl,
    scenario,
  });
  if (buyerFirst) {
    await note(services, deal.id, "deal_created", "buyer", `${fixture.buyer.displayName} started a deal from a listing and invited the seller.`);
    await note(services, deal.id, "seller_invited", "system", "Invite sent to the seller's PayPal email.");
    await store.transition(deal.id, "INVITED", "system", "Waiting for the seller.");
    await store.markSellerJoined(deal.id, fixture.seller);
  } else {
    await note(services, deal.id, "deal_created", "seller", `${fixture.seller.displayName} started a deal.`);
  }

  // Fixture payees have no sandbox account behind them; a configured sandbox seller takes their place.
  const sellerPaypalEmail = services.demoPayee ?? cardV1.sellerPaypalEmail;
  await store.saveCard({ ...cardV1, dealId: deal.id, sellerPaypalEmail, lockedAt: null });
  const identNote = cardV1.certNumber
    ? `Cert ${cardV1.certNumber} read from the slab label.`
    : cardV1.serial
      ? `Serial ${cardV1.serial} read from the photos.${cardV1.boxSerial ? (cardV1.boxSerial === cardV1.serial ? " The box label shows the same serial." : ` The box label shows a different serial, ${cardV1.boxSerial}.`) : ""}`
      : "No serial found in the photos.";
  await say(services, deal.id, "seller_pal", "seller_pal", `I built card version 1 from your listing. ${identNote}`);
  await note(services, deal.id, "card_updated", "seller_pal", `Seller Pal built card version 1. ${identNote}`);
  deal = await store.transition(deal.id, "LISTED", "system", "Listed.");

  // Only the chat from before the first review belongs with card v1. Later messages (for example the
  // seller's reply with the added photo) would put the chat ahead of the card; those steps post them later.
  const chat = preReviewChat(fixture);
  // The fixture chat happened "before now": restamp it one minute apart, ending a minute ago.
  const base = Date.now() - (chat.length + 1) * 60_000;
  for (const [i, m] of chat.entries()) {
    await store.addMessage({
      dealId: deal.id,
      channel: m.channel,
      author: m.author,
      text: m.text,
      photos: m.photos.filter((p) => cardV1.photos.some((c) => c.url === p.url)),
      at: new Date(base + i * 60_000).toISOString(),
    });
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
