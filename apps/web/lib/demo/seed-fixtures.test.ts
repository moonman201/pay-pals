/**
 * The idempotent seed, run against the memory store wrapped in a small
 * finder: a second run seeds nothing, and a race (a finished deal appearing
 * during the replay) settles on the oldest.
 */
import { ALL_FIXTURES, cleanPs5, type Deal, type DealState, type ScenarioId } from "@pay-pals/contracts";
import { createMemoryDealStore, createReplayClock } from "@pay-pals/db";
import { describe, expect, it } from "vitest";
import { createServices } from "../services";
import { FINISHED_STATES, seedFixtureDeals, seedFixtureDealsIfMissing, type DealFinder } from "./seed-fixtures";

/** Tracks every deal the store creates so it can answer findDeals the way a database would. */
function withFinder(store: ReturnType<typeof createMemoryDealStore>) {
  const ids: string[] = [];
  const wrapped = {
    ...store,
    async createDeal(input: Parameters<typeof store.createDeal>[0]) {
      const deal = await store.createDeal(input);
      ids.push(deal.id);
      return deal;
    },
    async findDeals(query: { scenario: ScenarioId; states?: readonly DealState[] }): Promise<Deal[]> {
      const deals = await Promise.all(ids.map((id) => store.getDeal(id)));
      return deals.filter((d): d is Deal => d !== null && d.scenario === query.scenario && (!query.states || query.states.includes(d.state)));
    },
  };
  return wrapped as typeof store & DealFinder;
}

function servicesOn(store: ReturnType<typeof withFinder>, clock: () => Date = () => new Date()) {
  const base = createServices({}, () => {});
  return { store, buyerPal: base.buyerPal, buildEvidencePack: base.buildEvidencePack, demoPayee: null, clock };
}

describe("seeded timestamps follow the fixture (live site review item 7)", () => {
  it("every seeded event, the payment and the shipment carry the fixture's dates, in order, and live deals return to wall time", async () => {
    const replay = createReplayClock();
    let seeding = true;
    const store = createMemoryDealStore({ clock: () => (seeding ? replay.clock() : new Date()) });
    const base = createServices({}, () => {});
    const services = { store, buyerPal: base.buyerPal, buildEvidencePack: base.buildEvidencePack, demoPayee: null, clock: replay.clock };
    const ids = await seedFixtureDeals(services, () => {}, replay);
    seeding = false;

    for (const fixture of ALL_FIXTURES) {
      const id = ids[fixture.id]!;
      const events = await store.listEvents(id);
      // Same kinds in the same order, each at the fixture's time.
      expect(events.map((e) => [e.kind, e.at])).toEqual(fixture.timeline.map((e) => [e.kind, e.at]));
      for (let i = 1; i < events.length; i++) expect(Date.parse(events[i]!.at)).toBeGreaterThanOrEqual(Date.parse(events[i - 1]!.at));
      const deal = await store.getDeal(id);
      expect(deal?.createdAt).toBe(fixture.timeline[0]!.at);
      if (fixture.payment) {
        const payment = await store.getPayment(id);
        expect(payment?.createdAt).toBe(fixture.payment.createdAt);
        expect(payment?.capturedAt).toBe(fixture.payment.capturedAt);
      }
      if (fixture.shipment) {
        const shipment = await store.getShipment(id);
        expect(shipment?.shippedAt).toBe(fixture.shipment.shippedAt);
        expect(shipment?.deliveredAt).toBe(fixture.shipment.deliveredAt);
      }
      if (fixture.deal.sellerJoinedAt && fixture.deal.startedBy === "buyer") expect(deal?.sellerJoinedAt).toBe(fixture.deal.sellerJoinedAt);
      const messages = await store.listMessages(id, "deal");
      for (const m of fixture.chat) expect(messages.find((x) => x.text === m.text)?.at).toBe(m.at);
    }

    const before = Date.now();
    const live = await store.createDeal({ startedBy: "seller", seller: cleanPs5.seller, buyer: null, listingUrl: null, scenario: null });
    expect(Math.abs(Date.parse(live.createdAt) - before)).toBeLessThan(5_000);
  });
});

describe("seedFixtureDealsIfMissing", () => {
  it("seeds once and reuses the same deals on the next start", async () => {
    const replay = createReplayClock();
    const store = withFinder(createMemoryDealStore({ clock: replay.clock }));
    const services = servicesOn(store, replay.clock);
    const lines: string[] = [];
    const first = await seedFixtureDealsIfMissing(services, store, (l) => lines.push(l), replay);
    expect(Object.keys(first).sort()).toEqual(["clean-ps5", "empty-box", "fake-slab"]);
    expect(lines.at(-1)).toMatch(/3 seeded now/);
    for (const [scenario, id] of Object.entries(first)) {
      const deal = await store.getDeal(id!);
      expect(deal?.scenario).toBe(scenario);
      expect(FINISHED_STATES).toContain(deal?.state);
    }

    const second = await seedFixtureDealsIfMissing(services, store, (l) => lines.push(l), replay);
    expect(second).toEqual(first);
    expect(lines.at(-1)).toMatch(/0 seeded now/);
    expect((await store.findDeals({ scenario: "clean-ps5", states: FINISHED_STATES })).length).toBe(1);
  });

  it("settles on the oldest finished deal when another instance seeded during the replay", async () => {
    const replay = createReplayClock();
    const store = withFinder(createMemoryDealStore({ clock: replay.clock }));
    const services = servicesOn(store, replay.clock);
    // A rival instance finished first: an older BLOCKED scam deal appears while we replay.
    let rivalId: string | null = null;
    const racing: DealFinder = {
      async findDeals(query) {
        const mine = await store.findDeals(query);
        if (query.scenario === "fake-slab" && mine.length > 0 && !rivalId) {
          const rival = await store.createDeal({ startedBy: "buyer", seller: mine[0]!.seller, buyer: mine[0]!.buyer, listingUrl: null, scenario: "fake-slab" });
          await store.transition(rival.id, "LISTED", "system", "Listed.");
          await store.transition(rival.id, "REVIEWED", "system", "Reviewed.");
          await store.transition(rival.id, "BLOCKED", "system", "Blocked.");
          rivalId = rival.id;
          // Make the rival older than ours.
          const older = await store.getDeal(rival.id);
          const ours = mine[0]!;
          return [{ ...older!, createdAt: new Date(Date.parse(ours.createdAt) - 60_000).toISOString() }, ours];
        }
        return mine;
      },
    };
    const ids = await seedFixtureDealsIfMissing(services, racing, () => {}, replay);
    expect(ids["fake-slab"]).toBe(rivalId);
    expect(ids["clean-ps5"]).toBeDefined();
  });
});
