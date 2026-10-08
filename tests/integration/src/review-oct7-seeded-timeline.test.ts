/**
 * Live site review, Oct 7, PLAN item 14: the seeded demo deals must tell one
 * story. The real web seeder runs against the memory store with the real
 * rules-only pals; then every seeded timeline must run in order, and the
 * payment and shipment events must sit at the moments the payment and
 * shipment records say they happened.
 *
 * Red until PLAN item 7 lands (builder-paypal: an injectable store clock;
 * builder-web: the seeder replays each event at its fixture time). Today
 * every event carries the seed time while the records carry fixture dates.
 */
import { describe, expect, it } from "vitest";
import { ALL_FIXTURES, verifyChain } from "@pay-pals/contracts";
import type { DealEvent, ScenarioId } from "@pay-pals/contracts";
import { createBuyerPal, createEvidencePackBuilder, createFixtureCertLookup, createFixturePriceLookup } from "@pay-pals/agents";
import { createMemoryDealStore, createReplayClock } from "@pay-pals/db";
import type { PayPalsStore } from "@pay-pals/db";
import { seedFixtureDeals } from "../../../apps/web/lib/demo/seed-fixtures";
import { readSeedStamp, SEED_VERSION } from "../../../apps/web/lib/demo/seed-version";

/** A minute. The seeder may stamp a replayed event a little after its fixture time; a day apart is a different story. */
const TOLERANCE_MS = 60_000;

const ms = (iso: string) => Date.parse(iso);
const within = (a: string, b: string) => Math.abs(ms(a) - ms(b)) <= TOLERANCE_MS;

interface Seeded {
  store: PayPalsStore;
  ids: Partial<Record<ScenarioId, string>>;
}

/** The same wiring apps/web uses: a replay clock drives the store, and the seeder moves it to each fixture time. */
async function runSeeder(): Promise<Seeded> {
  const time = createReplayClock();
  const store = createMemoryDealStore({ clock: time.clock });
  const log: string[] = [];
  const ids = await seedFixtureDeals(
    {
      store,
      buyerPal: createBuyerPal({ anthropic: null, priceLookup: createFixturePriceLookup(), certLookup: createFixtureCertLookup() }),
      buildEvidencePack: createEvidencePackBuilder({ anthropic: null }),
      demoPayee: null,
      clock: time.clock,
    },
    (line) => log.push(line),
    time,
  );
  // The seeder logs instead of throwing; a scenario it could not seed is a failure here, not a quiet gap.
  expect(log.filter((l) => /could not seed/.test(l)), "seeder log").toEqual([]);
  return { store, ids };
}

function lastOfKind(events: DealEvent[], kind: DealEvent["kind"]): DealEvent | undefined {
  return [...events].reverse().find((e) => e.kind === kind);
}

describe("the web seeder on the memory store", () => {
  it("seeds every scenario into its finished state with a verifying chain", async () => {
    const { store, ids } = await runSeeder();
    for (const fixture of ALL_FIXTURES) {
      const id = ids[fixture.id];
      expect(id, `${fixture.id} seeded`).toBeDefined();
      const deal = (await store.getDeal(id!))!;
      expect(deal.state, fixture.id).toBe(fixture.deal.state);
      const events = await store.listEvents(id!);
      expect(verifyChain(events).ok, `${fixture.id} chain`).toBe(true);
      // One event per fixture timeline line, in the same order of kinds.
      expect(events.map((e) => e.kind), fixture.id).toEqual(fixture.timeline.map((e) => e.kind));
    }
  });

  it("J7: every seeded deal carries the seed version and its scenario on deal_created", async () => {
    const { store, ids } = await runSeeder();
    for (const fixture of ALL_FIXTURES) {
      const events = await store.listEvents(ids[fixture.id]!);
      const created = events.find((e) => e.kind === "deal_created");
      expect(created, `${fixture.id} deal_created`).toBeDefined();
      expect(readSeedStamp(created!.data), fixture.id).toEqual({ seedVersion: SEED_VERSION, scenario: fixture.id });
      expect(created!.data).toMatchObject({ seedVersion: SEED_VERSION, scenario: fixture.id });
    }
    expect(SEED_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it.each(ALL_FIXTURES.map((f) => [f.id, f] as const))("%s: events run in order", async (_id, fixture) => {
    const { store, ids } = await runSeeder();
    const events = await store.listEvents(ids[fixture.id]!);
    for (let i = 1; i < events.length; i++) {
      expect(ms(events[i]!.at), `${events[i - 1]!.kind} -> ${events[i]!.kind}`).toBeGreaterThanOrEqual(ms(events[i - 1]!.at));
    }
    const stateChanges = events.filter((e) => e.kind === "state_changed").map((e) => e.toState);
    expect(stateChanges).toEqual(fixture.timeline.filter((e) => e.kind === "state_changed").map((e) => e.toState));
  });

  it.each(ALL_FIXTURES.filter((f) => f.payment).map((f) => [f.id, f] as const))("%s: payment events sit at the payment record's times", async (_id, fixture) => {
    const { store, ids } = await runSeeder();
    const id = ids[fixture.id]!;
    const events = await store.listEvents(id);
    const payment = (await store.getPayment(id))!;

    const created = lastOfKind(events, "payment_created")!;
    expect(created, "payment_created event").toBeDefined();
    expect(ms(created.at), "payment_created is not after the record's createdAt").toBeLessThanOrEqual(ms(payment.createdAt) + TOLERANCE_MS);
    expect(within(created.at, payment.createdAt), `payment_created ${created.at} vs createdAt ${payment.createdAt}`).toBe(true);

    const captured = lastOfKind(events, "payment_captured")!;
    expect(captured, "payment_captured event").toBeDefined();
    expect(payment.capturedAt).not.toBeNull();
    expect(ms(captured.at), "payment_captured is not after the record's capturedAt").toBeLessThanOrEqual(ms(payment.capturedAt!) + TOLERANCE_MS);
    expect(within(captured.at, payment.capturedAt!), `payment_captured ${captured.at} vs capturedAt ${payment.capturedAt}`).toBe(true);
    expect(ms(captured.at)).toBeGreaterThanOrEqual(ms(created.at));
  });

  it.each(ALL_FIXTURES.filter((f) => f.shipment).map((f) => [f.id, f] as const))("%s: shipping events sit at the shipment record's times", async (_id, fixture) => {
    const { store, ids } = await runSeeder();
    const id = ids[fixture.id]!;
    const events = await store.listEvents(id);
    const shipment = (await store.getShipment(id))!;

    const shipped = lastOfKind(events, "shipped")!;
    expect(shipped, "shipped event").toBeDefined();
    expect(ms(shipped.at), "shipped is not after shippedAt").toBeLessThanOrEqual(ms(shipment.shippedAt) + TOLERANCE_MS);
    expect(within(shipped.at, shipment.shippedAt), `shipped ${shipped.at} vs shippedAt ${shipment.shippedAt}`).toBe(true);

    const delivered = lastOfKind(events, "delivered")!;
    expect(delivered, "delivered event").toBeDefined();
    expect(shipment.deliveredAt).not.toBeNull();
    expect(ms(delivered.at), "delivered is not after deliveredAt").toBeLessThanOrEqual(ms(shipment.deliveredAt!) + TOLERANCE_MS);
    expect(within(delivered.at, shipment.deliveredAt!), `delivered ${delivered.at} vs deliveredAt ${shipment.deliveredAt}`).toBe(true);
    expect(ms(delivered.at)).toBeGreaterThanOrEqual(ms(shipped.at));

    // Paid before shipped, shipped before delivered, as the records say.
    const payment = await store.getPayment(id);
    if (payment?.capturedAt) expect(ms(shipment.shippedAt)).toBeGreaterThanOrEqual(ms(payment.capturedAt));
  });
});
