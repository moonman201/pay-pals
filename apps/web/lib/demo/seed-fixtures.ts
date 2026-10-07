/**
 * Replays each scenario fixture through the store's public interface so the
 * memory store holds the three finished demo deals (scam blocked, clean
 * complete, wrong item in issue). The fixture timeline drives the replay:
 * state_changed events become transitions, the rest become data writes.
 * The store assigns fresh ids, so the result maps scenario id to deal id.
 */
import { ALL_FIXTURES, type DealEvent, type ItemCard, type ScenarioFixture, type ScenarioId } from "@pay-pals/contracts";
import { buildEvidenceFor } from "../deal/flows/evidence";
import type { Services } from "../services";
import { nowIso } from "../time";

type SeedServices = Pick<Services, "store" | "buyerPal" | "buildEvidencePack">;

async function replay(services: SeedServices, fixture: ScenarioFixture): Promise<string> {
  const { store } = services;
  const deal = await store.createDeal({ seller: fixture.seller, buyer: fixture.buyer, scenario: fixture.id });
  const id = deal.id;
  let savedCards = 0;
  let lockedCard: ItemCard | null = null;
  const recordEvent = (e: DealEvent, data?: Record<string, unknown>) =>
    store.appendEvent({ dealId: id, kind: e.kind, actor: e.actor, summary: e.summary, data, at: nowIso() });

  for (const event of fixture.timeline) {
    switch (event.kind) {
      case "state_changed": {
        if (!event.toState) break;
        await store.transition(id, event.toState, event.actor, event.summary);
        if (event.toState === "LISTED") {
          for (const m of fixture.chat) {
            await store.addMessage({ dealId: id, channel: m.channel, author: m.author, text: m.text, photos: m.photos, at: nowIso() });
          }
        }
        break;
      }
      case "card_updated": {
        const card = fixture.cards[savedCards];
        if (card) {
          await store.saveCard({ ...card, dealId: id, lockedAt: null });
          savedCards += 1;
        }
        await recordEvent(event);
        break;
      }
      case "review_posted": {
        const card = await store.getCurrentCard(id);
        if (card) {
          const chat = await store.listMessages(id, "deal");
          const result = await services.buyerPal.review(card, chat, { seller: fixture.seller });
          await store.saveVerdict(result.data);
          await store.addMessage({ dealId: id, channel: "buyer_pal", author: "buyer_pal", text: result.palMessage, photos: [], at: nowIso() });
        }
        await recordEvent(event);
        break;
      }
      case "card_locked": {
        const version = fixture.deal.lockedCardVersion ?? savedCards;
        lockedCard = await store.lockCard(id, version);
        await recordEvent(event);
        break;
      }
      case "payment_created": {
        if (fixture.payment) await store.savePayment({ ...fixture.payment, dealId: id, status: "CREATED", captureId: null, capturedAt: null });
        await recordEvent(event);
        break;
      }
      case "payment_captured": {
        if (fixture.payment) await store.savePayment({ ...fixture.payment, dealId: id });
        await recordEvent(event);
        break;
      }
      case "shipped": {
        if (fixture.shipment) await store.saveShipment({ ...fixture.shipment, dealId: id, deliveredAt: null });
        await recordEvent(event);
        break;
      }
      case "delivered": {
        if (fixture.shipment) await store.saveShipment({ ...fixture.shipment, dealId: id });
        await recordEvent(event);
        break;
      }
      case "arrival_checked": {
        if (lockedCard && fixture.arrivalPhotos.length > 0) {
          await store.addMessage({ dealId: id, channel: "deal", author: "buyer", text: "Arrival photos.", photos: fixture.arrivalPhotos, at: nowIso() });
          const result = await services.buyerPal.checkArrival(lockedCard, fixture.arrivalPhotos);
          await store.saveArrivalCheck(result.data);
          await store.addMessage({ dealId: id, channel: "buyer_pal", author: "buyer_pal", text: result.palMessage, photos: [], at: nowIso() });
        }
        await recordEvent(event, { photos: fixture.arrivalPhotos });
        break;
      }
      case "evidence_built": {
        const current = await store.getDeal(id);
        if (current) await buildEvidenceFor(services, current, "buyer");
        break;
      }
      default:
        await recordEvent(event);
    }
  }
  return id;
}

export async function seedFixtureDeals(services: SeedServices, log: (line: string) => void): Promise<Partial<Record<ScenarioId, string>>> {
  const ids: Partial<Record<ScenarioId, string>> = {};
  for (const fixture of ALL_FIXTURES) {
    try {
      ids[fixture.id] = await replay(services, fixture);
    } catch (error) {
      log(`[pay-pals] demo: could not seed ${fixture.id} (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  log(`[pay-pals] demo: seeded ${Object.keys(ids).length} finished demo deals`);
  return ids;
}
