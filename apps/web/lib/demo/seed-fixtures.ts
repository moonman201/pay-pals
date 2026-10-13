/**
 * Replays each scenario fixture through the store's public interface so the
 * store holds the three finished demo deals (stolen photo blocked, clean
 * complete, empty box in issue). The fixture timeline drives the replay:
 * state_changed events become transitions, the rest become data writes.
 * The store assigns fresh ids, so the result maps scenario id to deal id.
 *
 * Time: the store's clock is a replay clock set to each fixture event's `at`
 * before the call that produces it, so the seeded timeline, payment and
 * shipment run in order with the fixture's gaps. The fixture dates are
 * shifted by one constant per fixture so its last event lands a fixed
 * distance before the wall clock (the finished deals read as last week),
 * which keeps every later action on them after the deal's latest event.
 * Chat messages are added at their own (shifted) times, interleaved.
 *
 * On a durable store the seed is idempotent: a scenario that already has a
 * finished deal is not replayed, and when two server instances race, both
 * settle on the oldest finished deal for that scenario.
 */
import { ALL_FIXTURES, type Deal, type DealEvent, type DealState, type ItemCard, type ScenarioFixture, type ScenarioId } from "@pay-pals/contracts";
import { buildEvidenceFor } from "../deal/flows/evidence";
import type { Services } from "../services";
import { readSeedStamp, SEED_VERSION } from "./seed-version";
import { demoPayeeFor } from "./demo-payee";

type SeedServices = Pick<Services, "store" | "buyerPal" | "buildEvidencePack" | "demoPayee" | "clock">;

/** The part of a replay clock the seeder needs: move time to a fixture timestamp. */
export interface ReplayTime {
  set(iso: string): void;
}

const noClock: ReplayTime = { set: () => {} };

/** How far before the wall clock a fixture's last event lands. */
export const SEED_ANCHOR_MS = 3 * 24 * 60 * 60 * 1000;

/** Milliseconds to add to every fixture timestamp so the last event sits SEED_ANCHOR_MS before `nowMs`. */
export function fixtureOffsetMs(fixture: ScenarioFixture, nowMs: number): number {
  const last = fixture.timeline[fixture.timeline.length - 1];
  if (!last) return 0;
  return nowMs - SEED_ANCHOR_MS - Date.parse(last.at);
}

export function shiftIso(iso: string, offsetMs: number): string {
  return new Date(Date.parse(iso) + offsetMs).toISOString();
}

async function replay(services: SeedServices, fixture: ScenarioFixture, time: ReplayTime, nowMs: number): Promise<string> {
  const { store } = services;
  const offset = fixtureOffsetMs(fixture, nowMs);
  const when = (iso: string) => shiftIso(iso, offset);
  const at = (iso: string) => time.set(when(iso));
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
    return store.appendEvent({ dealId: id, kind: e.kind, actor: e.actor, summary: e.summary, data, at: when(e.at) });
  };
  /** Chat messages dated up to this moment, each at its own (shifted) fixture time. */
  const flushChat = async (upTo: string) => {
    while (nextChat < fixture.chat.length && fixture.chat[nextChat]!.at <= upTo) {
      const m = fixture.chat[nextChat]!;
      at(m.at);
      await store.addMessage({ dealId: id, channel: m.channel, author: m.author, text: m.text, photos: m.photos, at: when(m.at) });
      nextChat += 1;
    }
  };

  for (const event of fixture.timeline) {
    await flushChat(event.at);
    at(event.at);
    switch (event.kind) {
      case "deal_created": {
        // The seed stamp: lets a durable store tell a stale seeded deal from a current one (J7).
        await recordEvent(event, { seedVersion: SEED_VERSION, scenario: fixture.id });
        break;
      }
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
          await store.saveCard({ ...card, dealId: id, sellerPaypalEmail: demoPayeeFor(services.demoPayee, fixture.id) ?? card.sellerPaypalEmail, lockedAt: null });
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
          await store.saveVerdict({ ...result.data, createdAt: when(event.at) });
          await store.addMessage({ dealId: id, channel: "buyer_pal", author: "buyer_pal", text: result.palMessage, photos: [], at: when(event.at) });
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
          await store.savePayment({
            ...fixture.payment,
            dealId: id,
            payeeEmail: demoPayeeFor(services.demoPayee, fixture.id) ?? fixture.payment.payeeEmail,
            status: "CREATED",
            captureId: null,
            createdAt: when(fixture.payment.createdAt),
            capturedAt: null,
            historyHash,
          });
        }
        await recordEvent(event);
        break;
      }
      case "payment_captured": {
        if (fixture.payment) {
          const created = await store.getPayment(id);
          await store.savePayment({
            ...fixture.payment,
            dealId: id,
            payeeEmail: demoPayeeFor(services.demoPayee, fixture.id) ?? fixture.payment.payeeEmail,
            createdAt: when(fixture.payment.createdAt),
            capturedAt: fixture.payment.capturedAt ? when(fixture.payment.capturedAt) : null,
            historyHash: created?.historyHash ?? null,
          });
        }
        await recordEvent(event);
        break;
      }
      case "shipped": {
        if (fixture.shipment) await store.saveShipment({ ...shiftedShipment(fixture, when), dealId: id, deliveredAt: null });
        await recordEvent(event);
        break;
      }
      case "shipment_checked": {
        // The fixture's ship-time flags are already on the saved shipment; the pal's line goes to the buyer's pane.
        await store.addMessage({ dealId: id, channel: "buyer_pal", author: "buyer_pal", text: event.summary, photos: [], at: when(event.at) });
        await recordEvent(event, { flags: (fixture.shipment?.flags ?? []).map((f) => f.code) });
        break;
      }
      case "delivered": {
        if (fixture.shipment) await store.saveShipment({ ...shiftedShipment(fixture, when), dealId: id });
        await recordEvent(event);
        break;
      }
      case "arrival_checked": {
        if (lockedCard && fixture.arrivalPhotos.length > 0) {
          const photos = fixture.arrivalPhotos.map((p) => (p.addedAt ? { ...p, addedAt: when(p.addedAt) } : p));
          await store.addMessage({ dealId: id, channel: "deal", author: "buyer", text: "Arrival photos.", photos, at: when(event.at) });
          const result = await services.buyerPal.checkArrival(lockedCard, fixture.arrivalPhotos);
          await store.saveArrivalCheck({ ...result.data, photos, createdAt: when(event.at) });
          await store.addMessage({ dealId: id, channel: "buyer_pal", author: "buyer_pal", text: result.palMessage, photos: [], at: when(event.at) });
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

/** The fixture shipment with its dates and photo times shifted. */
function shiftedShipment(fixture: ScenarioFixture, when: (iso: string) => string): NonNullable<ScenarioFixture["shipment"]> {
  const s = fixture.shipment!;
  return {
    ...s,
    shippedAt: when(s.shippedAt),
    deliveredAt: s.deliveredAt ? when(s.deliveredAt) : null,
    packingPhotos: s.packingPhotos.map((p) => (p.addedAt ? { ...p, addedAt: when(p.addedAt) } : p)),
  };
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

/** The slice of a store this lookup needs. */
export interface EventReader {
  listEvents(dealId: string): Promise<DealEvent[]>;
}

/**
 * The seeded deal for a scenario among the finder's candidates: the oldest
 * one whose deal_created carries a seed stamp (any version). A finished deal
 * without a stamp is a person's own run of the scenario and never counts.
 */
export async function oldestSeeded(store: EventReader, candidates: Deal[]): Promise<{ deal: Deal; seedVersion: string } | null> {
  const stamped: { deal: Deal; seedVersion: string }[] = [];
  for (const deal of candidates) {
    const events = await store.listEvents(deal.id);
    const stamp = readSeedStamp(events.find((e) => e.kind === "deal_created")?.data);
    if (stamp) stamped.push({ deal, seedVersion: stamp.seedVersion });
  }
  const winner = oldest(stamped.map((s) => s.deal));
  return winner ? (stamped.find((s) => s.deal.id === winner.id) ?? null) : null;
}

/** Fresh replay of every scenario. For a store that starts empty on each process, such as the memory store. */
export async function seedFixtureDeals(services: SeedServices, log: Log, time: ReplayTime = noClock, nowMs: number = Date.now()): Promise<SeededIds> {
  const ids: SeededIds = {};
  for (const fixture of ALL_FIXTURES) {
    try {
      ids[fixture.id] = await replay(services, fixture, time, nowMs);
    } catch (error) {
      log(`[pay-pals] demo: could not seed ${fixture.id} (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  log(`[pay-pals] demo: seeded ${Object.keys(ids).length} finished demo deals`);
  return ids;
}

/** What happened to one scenario. "stale" means a seed from another version is there and nothing was replayed. */
export type SeedOutcome = { scenario: ScenarioId; dealId: string; outcome: "existing" | "seeded" | "stale"; seedVersion?: string };

/**
 * One scenario of the idempotent seed. Replays it only when no seed-stamped
 * finished deal exists, checks again after the replay, and settles on the
 * oldest so two seeders running at once converge. A seed from another version
 * is reported as "stale" and left alone: removing it is the sweep's job.
 * Throws if the replay fails; callers decide what a failure means.
 */
export async function seedScenarioIfMissing(
  services: SeedServices,
  finder: DealFinder,
  fixture: ScenarioFixture,
  log: Log,
  time: ReplayTime = noClock,
  nowMs: number = Date.now(),
): Promise<SeedOutcome> {
  const query = { scenario: fixture.id, states: FINISHED_STATES };
  // Only a stamped deal counts as the seed; a judge's own finished run of the scenario is just their deal.
  const existing = await oldestSeeded(services.store, await finder.findDeals(query));
  if (existing) {
    if (existing.seedVersion !== SEED_VERSION) {
      log(`[pay-pals] demo: stale demo seed for ${fixture.id} (seed ${existing.seedVersion}, current ${SEED_VERSION}); run npm run db:delete-seeded-demo-deals -w packages/db, then npm run demo:seed -w apps/web`);
      return { scenario: fixture.id, dealId: existing.deal.id, outcome: "stale", seedVersion: existing.seedVersion };
    }
    return { scenario: fixture.id, dealId: existing.deal.id, outcome: "existing", seedVersion: existing.seedVersion };
  }
  const created = await replay(services, fixture, time, nowMs);
  // Another instance may have seeded the same scenario meanwhile. Both pick the oldest stamped one.
  const settled = await oldestSeeded(services.store, await finder.findDeals(query));
  if (settled && settled.deal.id !== created) log(`[pay-pals] demo: ${fixture.id} was seeded twice, using the oldest`);
  return { scenario: fixture.id, dealId: settled?.deal.id ?? created, outcome: "seeded", seedVersion: SEED_VERSION };
}

/** Idempotent seed of every scenario into a durable store. Used by the CLI path and the tests; the app never calls it on a request. */
export async function seedFixtureDealsIfMissing(services: SeedServices, finder: DealFinder, log: Log, time: ReplayTime = noClock, nowMs: number = Date.now()): Promise<SeededIds> {
  const ids: SeededIds = {};
  let replayed = 0;
  for (const fixture of ALL_FIXTURES) {
    try {
      const result = await seedScenarioIfMissing(services, finder, fixture, log, time, nowMs);
      ids[fixture.id] = result.dealId;
      if (result.outcome === "seeded") replayed += 1;
    } catch (error) {
      log(`[pay-pals] demo: could not seed ${fixture.id} (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  log(`[pay-pals] demo: ${Object.keys(ids).length} finished demo deals available, ${replayed} seeded now`);
  return ids;
}
