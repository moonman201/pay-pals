/**
 * Builds a real deal history in the memory store, up to AGREED with the
 * card locked, and returns the deal id and the head of its hash chain. The
 * gate script and the sandbox test pass that head to createDealOrder so the
 * order on PayPal carries a genuine chain head in custom_id.
 */
import { verifyChain } from "@pay-pals/contracts";
import type { ItemCard, Party } from "@pay-pals/contracts";
import { createMemoryDealStore } from "@pay-pals/db";

export interface DemoHistory {
  dealId: string;
  /** The locked card, re-keyed to the new deal id. */
  card: ItemCard;
  /** Head of the chain after AGREED. */
  historyHash: string;
  eventCount: number;
}

export async function buildDemoHistory(lockedCard: ItemCard, seller: Party, buyer: Party): Promise<DemoHistory> {
  const store = createMemoryDealStore();
  const deal = await store.createDeal({ startedBy: "buyer", seller, buyer, listingUrl: "https://marketplace.example.com/listing/ps5" });
  await store.appendEvent({ dealId: deal.id, kind: "seller_invited", actor: "buyer", summary: `${buyer.displayName} invited ${seller.email}.`, at: new Date().toISOString() });
  await store.transition(deal.id, "INVITED", "system", "Invite sent.");
  await store.markSellerJoined(deal.id);
  const card = await store.saveCard({ ...lockedCard, dealId: deal.id, version: 1, lockedAt: null });
  await store.transition(deal.id, "LISTED", "system", "Listed.");
  await store.transition(deal.id, "REVIEWED", "buyer_pal", "Reviewed: go.");
  await store.recordAgreement(deal.id, "buyer");
  await store.recordAgreement(deal.id, "seller");
  const locked = await store.lockCard(deal.id, card.version);
  await store.transition(deal.id, "AGREED", "system", "Agreed.");
  const events = await store.listEvents(deal.id);
  const chain = verifyChain(events);
  if (!chain.ok || !chain.head) throw new Error("Demo history did not verify");
  return { dealId: deal.id, card: locked, historyHash: chain.head, eventCount: events.length };
}
