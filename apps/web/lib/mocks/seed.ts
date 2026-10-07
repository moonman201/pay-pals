/**
 * Loads the three fixture deals into a memory store as finished examples,
 * so /deals/<fixture id> shows a completed scam, clean and wrong-item deal.
 */
import type { ScenarioFixture } from "@pay-pals/contracts";
import { createMockBuyerPal } from "./buyer-pal";
import type { DealRecord, MemoryDealStore } from "./memory-store";

export async function recordFromFixture(fixture: ScenarioFixture): Promise<DealRecord> {
  const pal = createMockBuyerPal();
  const reviewCard = fixture.cards[0];
  const lockedCard = fixture.deal.lockedCardVersion ? fixture.cards.find((c) => c.version === fixture.deal.lockedCardVersion) : null;
  const verdicts = reviewCard ? [(await pal.review(reviewCard, fixture.chat)).data] : [];
  const arrival = lockedCard && fixture.arrivalPhotos.length > 0 ? (await pal.checkArrival(lockedCard, fixture.arrivalPhotos)).data : null;
  return {
    deal: fixture.deal,
    cards: [...fixture.cards],
    messages: [...fixture.chat],
    verdicts,
    arrival,
    payment: fixture.payment,
    shipment: fixture.shipment,
    evidence: null,
    events: [...fixture.timeline],
  };
}

export async function seedFixtures(store: MemoryDealStore, fixtures: readonly ScenarioFixture[]): Promise<void> {
  for (const fixture of fixtures) {
    store.importDeal(await recordFromFixture(fixture));
  }
}
