/**
 * The idempotent seed, run against the memory store wrapped in a small
 * finder: a second run seeds nothing, and a race (a finished deal appearing
 * during the replay) settles on the oldest.
 */
import { ALL_FIXTURES, cleanPs5, fakeSlab, type Deal, type DealState, type ScenarioId } from "@pay-pals/contracts";
import { createMemoryDealStore, createReplayClock } from "@pay-pals/db";
import { describe, expect, it } from "vitest";
import { buildEvidence } from "../deal/flows/evidence";
import { createServices } from "../services";
import { FINISHED_STATES, SEED_ANCHOR_MS, fixtureOffsetMs, seedFixtureDeals, seedFixtureDealsIfMissing, shiftIso, type DealFinder } from "./seed-fixtures";
import { readSeedStamp, SEED_VERSION } from "./seed-version";

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

describe("seeded timestamps follow the fixture, anchored in the past (live site review item 7 and the qa finding)", () => {
  it("every seeded event, the payment and the shipment keep the fixture's gaps, end three days before now, and live deals return to wall time", async () => {
    const replay = createReplayClock();
    let seeding = true;
    const store = createMemoryDealStore({ clock: () => (seeding ? replay.clock() : new Date()) });
    const base = createServices({}, () => {});
    const services = { store, buyerPal: base.buyerPal, buildEvidencePack: base.buildEvidencePack, demoPayee: null, clock: replay.clock };
    const nowMs = Date.now();
    const ids = await seedFixtureDeals(services, () => {}, replay, nowMs);
    seeding = false;

    for (const fixture of ALL_FIXTURES) {
      const id = ids[fixture.id]!;
      const offset = fixtureOffsetMs(fixture, nowMs);
      const shifted = (iso: string) => shiftIso(iso, offset);
      const events = await store.listEvents(id);
      // Same kinds in the same order, each at the fixture's time plus one constant offset.
      expect(events.map((e) => [e.kind, e.at])).toEqual(fixture.timeline.map((e) => [e.kind, shifted(e.at)]));
      for (let i = 1; i < events.length; i++) expect(Date.parse(events[i]!.at)).toBeGreaterThanOrEqual(Date.parse(events[i - 1]!.at));
      // The last event lands three days before now, so nothing seeded is in the future.
      expect(Date.parse(events[events.length - 1]!.at)).toBe(nowMs - SEED_ANCHOR_MS);
      expect(Date.parse(events[events.length - 1]!.at)).toBeLessThan(Date.now());
      // Gaps are the fixture's gaps.
      const gaps = (list: readonly { at: string }[]) => list.slice(1).map((e, i) => Date.parse(e.at) - Date.parse(list[i]!.at));
      expect(gaps(events)).toEqual(gaps(fixture.timeline));
      const deal = await store.getDeal(id);
      expect(deal?.createdAt).toBe(shifted(fixture.timeline[0]!.at));
      if (fixture.payment) {
        const payment = await store.getPayment(id);
        expect(payment?.createdAt).toBe(shifted(fixture.payment.createdAt));
        expect(payment?.capturedAt).toBe(fixture.payment.capturedAt ? shifted(fixture.payment.capturedAt) : null);
      }
      if (fixture.shipment) {
        const shipment = await store.getShipment(id);
        expect(shipment?.shippedAt).toBe(shifted(fixture.shipment.shippedAt));
        expect(shipment?.deliveredAt).toBe(fixture.shipment.deliveredAt ? shifted(fixture.shipment.deliveredAt) : null);
      }
      if (fixture.deal.sellerJoinedAt && fixture.deal.startedBy === "buyer") expect(deal?.sellerJoinedAt).toBe(shifted(fixture.deal.sellerJoinedAt));
      const messages = await store.listMessages(id, "deal");
      for (const m of fixture.chat) expect(messages.find((x) => x.text === m.text)?.at).toBe(shifted(m.at));
    }

    const before = Date.now();
    const live = await store.createDeal({ startedBy: "seller", seller: cleanPs5.seller, buyer: null, listingUrl: null, scenario: null });
    expect(Math.abs(Date.parse(live.createdAt) - before)).toBeLessThan(5_000);
  });

  it("an action on a seeded finished deal after seeding succeeds: its events land after the deal's latest", async () => {
    const services = createServices({}, () => {});
    const ids = await services.seededDeals;
    const clean = ids["clean-ps5"]!;
    const before = await services.store.listEvents(clean);
    const pack = await buildEvidence(services, clean, "buyer");
    expect(pack.dealId).toBe(clean);
    const after = await services.store.listEvents(clean);
    expect(after.length).toBe(before.length + 1);
    expect(after.at(-1)?.kind).toBe("evidence_built");
    expect(Date.parse(after.at(-1)!.at)).toBeGreaterThanOrEqual(Date.parse(before.at(-1)!.at));
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
    expect(lines.some((l) => /stale demo seed/.test(l))).toBe(false);
    expect((await store.findDeals({ scenario: "clean-ps5", states: FINISHED_STATES })).length).toBe(1);
  });

  it("ignores a person's own finished run of a scenario: it still seeds a stamped deal and returns that one", async () => {
    const replay = createReplayClock();
    const store = withFinder(createMemoryDealStore({ clock: replay.clock }));
    const services = servicesOn(store, replay.clock);

    // A judge played fake-slab to BLOCKED on the live site before the seed ran. No seed stamp on its deal_created.
    replay.set("2026-10-01T10:00:00.000Z");
    const judges = await store.createDeal({ startedBy: "buyer", seller: fakeSlab.seller, buyer: fakeSlab.buyer, listingUrl: fakeSlab.deal.listingUrl, scenario: "fake-slab" });
    await store.appendEvent({ dealId: judges.id, kind: "deal_created", actor: "buyer", summary: "A judge started a deal.", at: "2026-10-01T10:00:00.000Z" });
    await store.transition(judges.id, "INVITED", "system", "Waiting for the seller.");
    await store.transition(judges.id, "LISTED", "system", "Listed.");
    await store.transition(judges.id, "REVIEWED", "system", "Reviewed.");
    await store.transition(judges.id, "BLOCKED", "buyer_pal", "Blocked.");
    expect((await store.findDeals({ scenario: "fake-slab", states: FINISHED_STATES })).map((d) => d.id)).toEqual([judges.id]);

    const lines: string[] = [];
    const ids = await seedFixtureDealsIfMissing(services, store, (l) => lines.push(l), replay);
    expect(ids["fake-slab"]).toBeDefined();
    expect(ids["fake-slab"]).not.toBe(judges.id);
    expect(lines.at(-1)).toMatch(/3 seeded now/);
    const seededEvents = await store.listEvents(ids["fake-slab"]!);
    expect(readSeedStamp(seededEvents[0]?.data)?.scenario).toBe("fake-slab");
    const judgeEvents = await store.listEvents(judges.id);
    expect(readSeedStamp(judgeEvents[0]?.data)).toBeNull();

    // Both finished fake-slab deals exist now; a second start still picks the stamped one and seeds nothing.
    const again = await seedFixtureDealsIfMissing(services, store, (l) => lines.push(l), replay);
    expect(again["fake-slab"]).toBe(ids["fake-slab"]);
    expect(lines.at(-1)).toMatch(/0 seeded now/);
    expect(lines.some((l) => /stale demo seed/.test(l))).toBe(false);
    expect((await store.findDeals({ scenario: "fake-slab", states: FINISHED_STATES })).length).toBe(2);
  });

  it("stamps deal_created with the seed version and the scenario, and reports a stale seed without seeding a duplicate", async () => {
    const replay = createReplayClock();
    const store = withFinder(createMemoryDealStore({ clock: replay.clock }));
    const services = servicesOn(store, replay.clock);
    const ids = await seedFixtureDealsIfMissing(services, store, () => {}, replay);
    const events = await store.listEvents(ids["clean-ps5"]!);
    expect(readSeedStamp(events[0]?.data)).toEqual({ seedVersion: SEED_VERSION, scenario: "clean-ps5" });
    expect(SEED_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);

    // A store seeded by an older build: the stamp differs (or is missing). Log once, keep the existing deal, add nothing.
    const olderFinder: DealFinder = {
      findDeals: async (q) => (await store.findDeals(q)).map((d) => d),
    };
    const stale = { ...services, store: { ...store, listEvents: async (id: string) => (await store.listEvents(id)).map((e, i) => (i === 0 ? { ...e, data: { seedVersion: "2000-01-01.0", scenario: e.data?.scenario } } : e)) } };
    const lines: string[] = [];
    const again = await seedFixtureDealsIfMissing(stale, olderFinder, (l) => lines.push(l), replay);
    expect(again).toEqual(ids);
    const staleLines = lines.filter((l) => /stale demo seed/.test(l));
    expect(staleLines).toHaveLength(3);
    expect(staleLines[0]).toMatch(/run npm run db:delete-seeded-demo-deals -w packages\/db, then npm run demo:seed -w apps\/web/);
    expect(lines.at(-1)).toMatch(/0 seeded now/);
  });

  it("settles on the oldest finished deal when another instance seeded during the replay", async () => {
    const replay = createReplayClock();
    const store = withFinder(createMemoryDealStore({ clock: replay.clock }));
    const services = servicesOn(store, replay.clock);
    // A rival instance finished first: an older, stamped BLOCKED fake-slab seed appears while we replay.
    let rivalId: string | null = null;
    const racing: DealFinder = {
      async findDeals(query) {
        const mine = await store.findDeals(query);
        if (query.scenario === "fake-slab" && mine.length > 0 && !rivalId) {
          const rival = await store.createDeal({ startedBy: "buyer", seller: mine[0]!.seller, buyer: mine[0]!.buyer, listingUrl: null, scenario: "fake-slab" });
          await store.appendEvent({ dealId: rival.id, kind: "deal_created", actor: "buyer", summary: "Seeded by another instance.", data: { seedVersion: SEED_VERSION, scenario: "fake-slab" }, at: replay.now() });
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
