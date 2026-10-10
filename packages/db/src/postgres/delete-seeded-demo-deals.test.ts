/**
 * deleteSeededDemoDeals on PGlite: a deal goes only if it carries our seed
 * stamp, has a scenario and is finished, and its stamp is not the one being
 * kept. Everything else stays, including a judge's own unstamped run and a
 * stamped seed that is still in flight.
 *
 * The case the earlier payment-based rule missed is here by name
 * (staleRealOrder): a seed that was re-seeded against the real sandbox, so
 * it carries a real paypal_order_id and a locked card. The old rule looked
 * for a FIXTURE- order id or no payment at all, so that deal matched
 * neither branch and could never be deleted.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getFixture } from "@pay-pals/contracts";
import type { PayPalsStore } from "@pay-pals/contracts";
import * as schema from "../../schema";
import { createReplayClock } from "../clock";
import { deleteSeededDemoDeals, explainDeal } from "./delete-seeded-demo-deals";
import { runMigrations } from "./migrate";
import { createPostgresDealStoreFromDb } from "./postgres-store";

const clean = getFixture("clean-ps5");
const slab = getFixture("fake-slab");
const CURRENT = "2026-10-08.1";
const STALE = "2026-10-07.3";
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

/** The seeder's stamp: data.seedVersion on the deal_created event. Null writes the event without one. */
async function stamp(store: PayPalsStore, dealId: string, seedVersion: string | null, scenario: string) {
  await store.appendEvent({
    dealId,
    kind: "deal_created",
    actor: "system",
    summary: "Seeded.",
    data: seedVersion ? { seedVersion, scenario } : { scenario },
    at: (await store.getDeal(dealId))!.createdAt,
  });
}

const TO_COMPLETE = ["REVIEWED", "AGREED", "PAYMENT_PENDING", "PAID", "SHIPPED", "DELIVERED", "COMPLETE"] as const;

describe("deleteSeededDemoDeals", () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await runMigrations(db);
  }, 60_000);

  afterAll(async () => {
    await client?.close();
  });

  it("deletes stamped finished seeds whatever their payment, and refuses everything unstamped, unfinished or without a scenario", async () => {
    const store = createPostgresDealStoreFromDb(db, { clock: createReplayClock(hoursAgo(9)).clock });

    // Goes: a stale seed with a fixture order id.
    const staleFixture = await store.createDeal({ startedBy: "buyer", seller: clean.seller, buyer: clean.buyer, scenario: "clean-ps5" });
    await stamp(store, staleFixture.id, STALE, "clean-ps5");
    await store.transition(staleFixture.id, "LISTED", "system", "Listed.");
    await store.savePayment({ ...clean.payment!, dealId: staleFixture.id, paypalOrderId: "FIXTURE-ORDER-STALE" });
    for (const s of TO_COMPLETE) await store.transition(staleFixture.id, s, "system", s);

    // Goes, and the old rule could not touch it: a stale seed re-seeded against the
    // real sandbox, so it has a real order id and a locked card.
    const staleRealOrder = await store.createDeal({ startedBy: "buyer", seller: clean.seller, buyer: clean.buyer, scenario: "clean-ps5" });
    await stamp(store, staleRealOrder.id, STALE, "clean-ps5");
    await store.saveCard({ ...clean.cards[0]!, dealId: staleRealOrder.id, version: 1, lockedAt: null });
    await store.transition(staleRealOrder.id, "LISTED", "system", "Listed.");
    await store.transition(staleRealOrder.id, "REVIEWED", "system", "Reviewed.");
    await store.lockCard(staleRealOrder.id, 1);
    for (const s of ["AGREED", "PAYMENT_PENDING", "PAID", "SHIPPED", "DELIVERED", "COMPLETE"] as const) await store.transition(staleRealOrder.id, s, "system", s);
    await store.savePayment({ ...clean.payment!, dealId: staleRealOrder.id, paypalOrderId: "7XY41188KK992034L" });

    // Goes: a stale seed that never got as far as a payment.
    const staleNoPayment = await store.createDeal({ startedBy: "seller", seller: clean.seller, buyer: clean.buyer, scenario: "empty-box" });
    await stamp(store, staleNoPayment.id, STALE, "empty-box");
    for (const s of ["LISTED", "REVIEWED", "AGREED", "PAYMENT_PENDING", "PAID", "ISSUE"] as const) await store.transition(staleNoPayment.id, s, "system", s);

    // Stays while CURRENT is kept: the seed the deployed site is pointing at.
    const current = await store.createDeal({ startedBy: "buyer", seller: clean.seller, buyer: clean.buyer, scenario: "clean-ps5" });
    await stamp(store, current.id, CURRENT, "clean-ps5");
    await store.transition(current.id, "LISTED", "system", "Listed.");
    await store.savePayment({ ...clean.payment!, dealId: current.id, paypalOrderId: "FIXTURE-ORDER-CURRENT" });
    for (const s of TO_COMPLETE) await store.transition(current.id, s, "system", s);

    // Stays, and this is the change: a judge's own run is unstamped, so it is not ours to delete.
    // Same shape as the hosted row 1aeb93c3: buyer-started, one unlocked card, BLOCKED, no payment.
    const judge = await store.createDeal({ startedBy: "buyer", seller: slab.seller, buyer: slab.buyer, scenario: "fake-slab" });
    await stamp(store, judge.id, null, "fake-slab");
    await store.transition(judge.id, "INVITED", "system", "Invite sent.");
    await store.markSellerJoined(judge.id);
    await store.saveCard({ ...slab.cards[0]!, dealId: judge.id, version: 1, lockedAt: null });
    await store.transition(judge.id, "LISTED", "system", "Listed.");
    await store.transition(judge.id, "REVIEWED", "buyer_pal", "Reviewed.");
    await store.transition(judge.id, "BLOCKED", "buyer_pal", "Stopped.");

    // Stays: stamped, but still in flight. The finished-state safety net holds it.
    const stampedInFlight = await store.createDeal({ startedBy: "buyer", seller: clean.seller, buyer: clean.buyer, scenario: "clean-ps5" });
    await stamp(store, stampedInFlight.id, STALE, "clean-ps5");
    for (const s of ["LISTED", "REVIEWED", "AGREED", "PAYMENT_PENDING"] as const) await store.transition(stampedInFlight.id, s, "system", s);

    // Stays: stamped and finished, but no scenario. The scenario safety net holds it.
    const stampedNoScenario = await store.createDeal({ startedBy: "seller", seller: clean.seller });
    await stamp(store, stampedNoScenario.id, STALE, "none");
    for (const s of ["LISTED", "REVIEWED", "BLOCKED"] as const) await store.transition(stampedNoScenario.id, s, "system", s);

    // Stays: a real unstamped deal in flight with a real PayPal order id.
    const real = await store.createDeal({ startedBy: "buyer", seller: clean.seller, buyer: clean.buyer, scenario: "clean-ps5" });
    await store.transition(real.id, "LISTED", "system", "Listed.");
    await store.savePayment({ ...clean.payment!, dealId: real.id, paypalOrderId: "5O190127TN364715T", status: "CREATED", captureId: null, capturedAt: null });

    // Stays: a real unstamped deal that finished properly.
    const realDone = await store.createDeal({ startedBy: "buyer", seller: clean.seller, buyer: clean.buyer, scenario: "clean-ps5" });
    await store.transition(realDone.id, "LISTED", "system", "Listed.");
    for (const s of TO_COMPLETE) await store.transition(realDone.id, s, "system", s);
    await store.savePayment({ ...clean.payment!, dealId: realDone.id, paypalOrderId: "88E31677MD763411W" });

    // explainDeal names the factor that decides each one.
    const whyStaleRealOrder = await explainDeal(db, staleRealOrder.id, CURRENT);
    expect(whyStaleRealOrder).toMatchObject({ found: true, scenario: "clean-ps5", state: "COMPLETE", lockedCardVersion: 1, cardCount: 1, paymentOrderIds: ["7XY41188KK992034L"], seedVersion: STALE, candidate: true });
    const failing = async (dealId: string) => (await explainDeal(db, dealId, CURRENT)).checks.filter((c) => !c.pass).map((c) => c.rule);
    expect(await failing(judge.id)).toEqual(["deal_created carries a seed stamp"]);
    expect(await failing(stampedInFlight.id)).toEqual(["state in COMPLETE, BLOCKED, ISSUE"]);
    expect(await failing(stampedNoScenario.id)).toEqual(["scenario is set"]);
    expect(await failing(real.id)).toEqual(["deal_created carries a seed stamp", "state in COMPLETE, BLOCKED, ISSUE"]);
    expect(await failing(current.id)).toEqual([`seed stamp is not ${CURRENT}`]);
    expect(await failing(realDone.id)).toEqual(["deal_created carries a seed stamp"]);
    expect((await explainDeal(db, "00000000-0000-4000-8000-000000000000")).found).toBe(false);

    const preview = await deleteSeededDemoDeals(db, { dryRun: true, keepSeedVersion: CURRENT });
    expect(preview.deleted).toBe(0);
    // All deals here share one replay instant, so compare as a set rather than by creation order.
    const byId = (rows: Array<[string, ...unknown[]]>) => [...rows].sort((a, b) => a[0].localeCompare(b[0]));
    expect(byId(preview.candidates.map((c) => [c.id, c.scenario, c.state, c.seedVersion, c.payment]))).toEqual(
      byId([
        [staleFixture.id, "clean-ps5", "COMPLETE", STALE, "fixture order"],
        [staleRealOrder.id, "clean-ps5", "COMPLETE", STALE, "real order"],
        [staleNoPayment.id, "empty-box", "ISSUE", STALE, "none"],
      ]),
    );
    expect(await store.getDeal(staleRealOrder.id)).not.toBeNull();

    const result = await deleteSeededDemoDeals(db, { dryRun: false, keepSeedVersion: CURRENT });
    expect(result.deleted).toBe(3);
    for (const gone of [staleFixture.id, staleRealOrder.id, staleNoPayment.id]) expect(await store.getDeal(gone)).toBeNull();
    for (const kept of [current.id, judge.id, stampedInFlight.id, stampedNoScenario.id, real.id, realDone.id]) expect(await store.getDeal(kept)).not.toBeNull();

    // Children went with the deal; the kept deals keep theirs.
    expect(await store.listEvents(staleRealOrder.id)).toEqual([]);
    expect(await store.listCards(staleRealOrder.id)).toEqual([]);
    expect(await store.getPaymentByOrderId("FIXTURE-ORDER-STALE")).toBeNull();
    expect(await store.getPaymentByOrderId("7XY41188KK992034L")).toBeNull();
    expect(await store.getPaymentByOrderId("FIXTURE-ORDER-CURRENT")).not.toBeNull();
    expect(await store.getPaymentByOrderId("5O190127TN364715T")).not.toBeNull();
    expect(await store.listEvents(judge.id)).not.toEqual([]);

    // A second run with the same version finds nothing left.
    expect(await deleteSeededDemoDeals(db, { dryRun: false, keepSeedVersion: CURRENT })).toEqual({ candidates: [], deleted: 0 });
    // Without --keep-seed the current seed goes too, and still nothing unstamped.
    const all = await deleteSeededDemoDeals(db, { dryRun: true, keepSeedVersion: null });
    expect(all.candidates.map((c) => c.id)).toEqual([current.id]);
  }, 90_000);
});
