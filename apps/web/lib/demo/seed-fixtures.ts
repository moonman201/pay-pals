/**
 * Replays each scenario fixture through the store's public interface so the
 * store holds the three finished demo deals (fake slab blocked, clean
 * complete, empty box in issue). The fixture timeline drives the replay:
 * state_changed events become transitions, the rest become data writes.
 * The store assigns fresh ids, so the result maps scenario id to deal id.
 *
 * Time: the store's clock is a replay clock set to each fixture event's `at`
 * before the call that produces it, so the seeded timeline, payment and
 * shipment carry the fixture's dates and run in order. Chat messages are
 * added at their own fixture times, interleaved with the events.
 *
 * On a durable store the seed is idempotent: a scenario that already has a
 * finished deal is not replayed, and when two server instances race, both
 * settle on the oldest finished deal for that scenario.
 */
import { ALL_FIXTURES, type Deal, type DealEvent, type DealState, type ItemCard, type ScenarioFixture, type ScenarioId } from "@pay-pals/contracts";
import { buildEvidenceFor } from "../deal/flows/evidence";
import type { Services } from "../services";

type SeedServices = Pick<Services, "store" | "buyerPal" | "buildEvidencePack" | "demoPayee" | "clock">;

/** The part of a replay clock the seeder needs: move time to a fixture timestamp. */
export interface ReplayTime {
  set(iso: string): void;
}

const noClock: ReplayTime = { set: () => {} };

async function replay(services: SeedServices, fixture: ScenarioFixture, time: ReplayTime): Promise<string> {
  const { store } = services;
  const at = (iso: string) => time.set(iso);
  const first = fixture.timeline[0];
  if (first) at(first.at);

  const deal = await store.createDeal({
    startedBy: fixture.deal.startedBy,
    seller: fixture.seller,
    buyer: fixture.buyer,
    listingUrl: fixture.deal.listingUrl,
    scenario: fixture.id,
  });
  const id = deal.id;
  let savedCards = 0;
  let lockedCard: ItemCard | null = null;
  let nextChat = 0;
  const recordEvent = (e: DealEvent, data?: Record<string, unknown>) => {
    at(e.at);
    return store.appendEvent({ dealId: id, kind: e.kind, actor: e.actor, summary: e.summary, data, at: e.at });
  };
  /** Chat messages dated up to this moment, each at its own fixture time. */
  const flushChat = async (upTo: string) => {
    while (nextChat < fixture.chat.length && fixture.chat[nextChat]!.at <= upTo) {
      const m = fixture.chat[nextChat]!;
      at(m.at);
      await store.addMessage({ dealId: id, channel: m.channel, author: m.author, text: m.text, photos: m.photos, at: m.at });
      nextChat += 1;
    }
  };

  for (const event of fixture.timeline) {
    await flushChat(event.at);
    at(event.at);
    switch (event.kind) {
      case "state_changed": {
        if (!event.toState) break;
        await store.transition(id, event.toState, event.actor, event.summary);
        break;
      }
      case "seller_joined": {
        // The store sets sellerJoinedAt and appends the event itself.
        await store.markSellerJoined(id, fixture.seller);
        break;
      }
      case "card_updated": {
        const card = fixture.cards[savedCards];
        if (card) {
          await store.saveCard({ ...card, dealId: id, sellerPaypalEmail: services.demoPayee ?? card.sellerPaypalEmail, lockedAt: null });
          savedCards += 1;
        }
        await recordEvent(event);
        break;
      }
      case "review_posted": {
        const card = await store.getCurrentCard(id);
        if (card) {
          const chat = await store.listMessages(id, "deal");
          const current = await store.getDeal(id);
          const result = await services.buyerPal.review(card, chat, {
            dealId: id,
            seller: fixture.seller,
            listingUrl: fixture.deal.listingUrl,
            sellerJoined: (current?.sellerJoinedAt ?? null) !== null,
            inviteDeclined: false,
          });
          await store.saveVerdict({ ...result.data, createdAt: event.at });
          await store.addMessage({ dealId: id, channel: "buyer_pal", author: "buyer_pal", text: result.palMessage, photos: [], at: event.at });
        }
        await recordEvent(event);
        break;
      }
      case "agreed": {
        // The store appends the agreed event itself, at the clock's time.
        if (event.actor === "buyer" || event.actor === "seller") await store.recordAgreement(id, event.actor);
        break;
      }
      case "card_locked": {
        const version = fixture.deal.lockedCardVersion ?? savedCards;
        lockedCard = await store.lockCard(id, version);
        await recordEvent(event);
        break;
      }
      case "payment_created": {
        if (fixture.payment) {
          const events = await store.listEvents(id);
          const historyHash = events[events.length - 1]?.hash ?? null;
          await store.savePayment({ ...fixture.payment, dealId: id, payeeEmail: services.demoPayee ?? fixture.payment.payeeEmail, status: "CREATED", captureId: null, capturedAt: null, historyHash });
        }
        await recordEvent(event);
        break;
      }
      case "payment_captured": {
        if (fixture.payment) {
          const created = await store.getPayment(id);
          await store.savePayment({ ...fixture.payment, dealId: id, payeeEmail: services.demoPayee ?? fixture.payment.payeeEmail, historyHash: created?.historyHash ?? null });
        }
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
          await store.addMessage({ dealId: id, channel: "deal", author: "buyer", text: "Arrival photos.", photos: fixture.arrivalPhotos, at: event.at });
          const result = await services.buyerPal.checkArrival(lockedCard, fixture.arrivalPhotos);
          await store.saveArrivalCheck({ ...result.data, photos: fixture.arrivalPhotos, createdAt: event.at });
          await store.addMessage({ dealId: id, channel: "buyer_pal", author: "buyer_pal", text: result.palMessage, photos: [], at: event.at });
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
  await flushChat("9999-12-31T23:59:59.999Z");
  return id;
}

type Log = (line: string) => void;
type SeededIds = Partial<Record<ScenarioId, string>>;

/** The end state each scenario's finished deal sits in. */
export const FINISHED_STATES: readonly DealState[] = ["COMPLETE", "BLOCKED", "ISSUE"];

/**
 * Lookup a durable store needs for an idempotent seed. The DealStore contract
 * has no query by scenario yet; a store that offers findDeals gets the
 * idempotent path, any other store gets a fresh replay (right for memory).
 */
export interface DealFinder {
  findDeals(query: { scenario: ScenarioId; states?: readonly DealState[] }): Promise<Deal[]>;
}

export function asDealFinder(store: unknown): DealFinder | null {
  const candidate = store as { findDeals?: unknown };
  return typeof candidate?.findDeals === "function" ? (store as DealFinder) : null;
}

function oldest(deals: Deal[]): Deal | null {
  return deals.length === 0 ? null : deals.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b));
}

/** Fresh replay of every scenario. For a store that starts empty on each process, such as the memory store. */
export async function seedFixtureDeals(services: SeedServices, log: Log, time: ReplayTime = noClock): Promise<SeededIds> {
  const ids: SeededIds = {};
  for (const fixture of ALL_FIXTURES) {
    try {
      ids[fixture.id] = await replay(services, fixture, time);
    } catch (error) {
      log(`[pay-pals] demo: could not seed ${fixture.id} (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  log(`[pay-pals] demo: seeded ${Object.keys(ids).length} finished demo deals`);
  return ids;
}

/**
 * Idempotent seed for a durable store. Replays a scenario only when no
 * finished deal for it exists, checks again after the replay, and settles on
 * the oldest finished deal so two instances seeding at once converge.
 */
export async function seedFixtureDealsIfMissing(services: SeedServices, finder: DealFinder, log: Log, time: ReplayTime = noClock): Promise<SeededIds> {
  const ids: SeededIds = {};
  let replayed = 0;
  for (const fixture of ALL_FIXTURES) {
    try {
      const query = { scenario: fixture.id, states: FINISHED_STATES };
      const existing = oldest(await finder.findDeals(query));
      if (existing) {
        ids[fixture.id] = existing.id;
        continue;
      }
      const created = await replay(services, fixture, time);
      replayed += 1;
      // Another instance may have seeded the same scenario meanwhile. Both pick the oldest.
      const settled = oldest(await finder.findDeals(query));
      ids[fixture.id] = settled?.id ?? created;
      if (settled && settled.id !== created) log(`[pay-pals] demo: ${fixture.id} was seeded twice, using the oldest`);
    } catch (error) {
      log(`[pay-pals] demo: could not seed ${fixture.id} (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  log(`[pay-pals] demo: ${Object.keys(ids).length} finished demo deals available, ${replayed} seeded now`);
  return ids;
}
