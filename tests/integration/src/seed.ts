/**
 * Seeds a scenario fixture into a fresh in-memory store. The store issues its
 * own deal id, so every fixture row is re-keyed to it. Returns the pieces the
 * tests reuse: the store, the live deal id and the fixture rows re-keyed.
 */
import type { DealState, ItemCard, Message, PaymentRecord, Photo, ScenarioFixture, Shipment } from "@pay-pals/contracts";
import { DEAL_TRANSITIONS } from "@pay-pals/contracts";
import { createMemoryDealStore } from "@pay-pals/db";
import type { PayPalsStore } from "@pay-pals/db";

export interface SeededDeal {
  store: PayPalsStore;
  dealId: string;
  fixture: ScenarioFixture;
  cards: ItemCard[];
  chat: Message[];
  payment: PaymentRecord | null;
  shipment: Shipment | null;
  arrivalPhotos: Photo[];
}

const rekey = <T extends { dealId: string }>(row: T, dealId: string): T => ({ ...row, dealId });

/** Creates the deal as the fixture's starter, saves every card version in order and adds the shared chat. The deal is left in DRAFT. */
export async function seedFixture(fixture: ScenarioFixture, store: PayPalsStore = createMemoryDealStore()): Promise<SeededDeal> {
  const deal = await store.createDeal({
    startedBy: fixture.deal.startedBy,
    seller: fixture.seller,
    buyer: fixture.buyer,
    listingUrl: fixture.deal.listingUrl,
    scenario: fixture.id,
  });
  const cards: ItemCard[] = [];
  for (const card of fixture.cards) cards.push(await store.saveCard(rekey(card, deal.id)));
  const chat: Message[] = [];
  for (const { id: _ignored, ...message } of fixture.chat) chat.push(await store.addMessage(rekey(message, deal.id)));
  return {
    store,
    dealId: deal.id,
    fixture,
    cards,
    chat,
    payment: fixture.payment ? rekey(fixture.payment, deal.id) : null,
    shipment: fixture.shipment ? rekey(fixture.shipment, deal.id) : null,
    arrivalPhotos: fixture.arrivalPhotos,
  };
}

/** Shortest legal path from DRAFT to a state, read from the transition table. Throws if the state is unreachable. */
export function pathTo(target: DealState): DealState[] {
  const previous = new Map<DealState, DealState | null>([["DRAFT", null]]);
  const queue: DealState[] = ["DRAFT"];
  while (queue.length > 0) {
    const state = queue.shift()!;
    if (state === target) break;
    for (const next of DEAL_TRANSITIONS[state]) {
      if (previous.has(next)) continue;
      previous.set(next, state);
      queue.push(next);
    }
  }
  if (!previous.has(target)) throw new Error(`${target} is not reachable from DRAFT`);
  const path: DealState[] = [];
  for (let s: DealState | null = target; s && s !== "DRAFT"; s = previous.get(s) ?? null) path.unshift(s);
  return path;
}

/** Walks a seeded deal along the legal path from DRAFT to the target state. */
export async function driveTo(seeded: SeededDeal, target: DealState): Promise<void> {
  for (const next of pathTo(target)) {
    await seeded.store.transition(seeded.dealId, next, "system", `${next}.`);
  }
}
