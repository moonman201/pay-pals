/**
 * deleteSeededDemoDeals on PGlite: finished scenario deals go unless they
 * carry the current seed stamp; real deals in flight stay; children go
 * with their deal. Includes the shape of the deal the first rule missed on
 * the hosted database (1aeb93c3: buyer-started, one unlocked card, BLOCKED,
 * no payment).
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
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

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

  it("deletes finished scenario deals without the current seed stamp, keeps the rest, children included", async () => {
    const store = createPostgresDealStoreFromDb(db, { clock: createReplayClock(hoursAgo(9)).clock });

    // The 1aeb93c3 shape: a judge's own fake-slab run, buyer-started, one unlocked card, BLOCKED, no payment, no stamp.
    const judge = await store.createDeal({ startedBy: "buyer", seller: slab.seller, buyer: slab.buyer, scenario: "fake-slab" });
    await stamp(store, judge.id, null, "fake-slab");
    await store.transition(judge.id, "INVITED", "system", "Invite sent.");
    await store.markSellerJoined(judge.id);
    await store.saveCard({ ...slab.cards[0]!, dealId: judge.id, version: 1, lockedAt: null });
    await store.transition(judge.id, "LISTED", "system", "Listed.");
    await store.transition(judge.id, "REVIEWED", "buyer_pal", "Reviewed.");
    await store.transition(judge.id, "BLOCKED", "buyer_pal", "Stopped.");

    // A stale seed: fixture payment, COMPLETE, stamped with an older version.
    const stale = await store.createDeal({ startedBy: "buyer", seller: clean.seller, buyer: clean.buyer, scenario: "clean-ps5" });
    await stamp(store, stale.id, "2026-10-07.3", "clean-ps5");
    await store.transition(stale.id, "LISTED", "system", "Listed.");
    await store.savePayment({ ...clean.payment!, dealId: stale.id, paypalOrderId: "FIXTURE-ORDER-STALE" });
    for (const s of ["REVIEWED", "AGREED", "PAYMENT_PENDING", "PAID", "SHIPPED", "DELIVERED", "COMPLETE"] as const) await store.transition(stale.id, s, "system", s);

    // The current seed: same shape, stamped with the current version. Must stay.
    const current = await store.createDeal({ startedBy: "buyer", seller: clean.seller, buyer: clean.buyer, scenario: "clean-ps5" });
    await stamp(store, current.id, CURRENT, "clean-ps5");
    await store.transition(current.id, "LISTED", "system", "Listed.");
    await store.savePayment({ ...clean.payment!, dealId: current.id, paypalOrderId: "FIXTURE-ORDER-CURRENT" });
    for (const s of ["REVIEWED", "AGREED", "PAYMENT_PENDING", "PAID", "SHIPPED", "DELIVERED", "COMPLETE"] as const) await store.transition(current.id, s, "system", s);

    // A finished ISSUE deal with no payment and no lock, unstamped: goes.
    const issue = await store.createDeal({ startedBy: "seller", seller: clean.seller, buyer: clean.buyer, scenario: "empty-box" });
    await store.transition(issue.id, "LISTED", "system", "Listed.");
    await store.transition(issue.id, "REVIEWED", "system", "Reviewed.");
    await store.transition(issue.id, "AGREED", "system", "Agreed.");
    for (const s of ["PAYMENT_PENDING", "PAID", "ISSUE"] as const) await store.transition(issue.id, s, "system", s);

    // Must stay: a real deal in flight with a real PayPal order id.
    const real = await store.createDeal({ startedBy: "buyer", seller: clean.seller, buyer: clean.buyer, scenario: "clean-ps5" });
    await store.transition(real.id, "LISTED", "system", "Listed.");
    await store.savePayment({ ...clean.payment!, dealId: real.id, paypalOrderId: "5O190127TN364715T", status: "CREATED", captureId: null, capturedAt: null });

    // Must stay: a real COMPLETE deal paid with a real PayPal order (locked card, real order id).
    const realDone = await store.createDeal({ startedBy: "buyer", seller: clean.seller, buyer: clean.buyer, scenario: "clean-ps5" });
    await store.saveCard({ ...clean.cards[0]!, dealId: realDone.id, version: 1, lockedAt: null });
    await store.transition(realDone.id, "LISTED", "system", "Listed.");
    await store.transition(realDone.id, "REVIEWED", "system", "Reviewed.");
    await store.lockCard(realDone.id, 1);
    for (const s of ["AGREED", "PAYMENT_PENDING", "PAID", "SHIPPED", "DELIVERED", "COMPLETE"] as const) await store.transition(realDone.id, s, "system", s);
    await store.savePayment({ ...clean.payment!, dealId: realDone.id, paypalOrderId: "88E31677MD763411W" });

    // Must stay: a BLOCKED deal with a locked card and no payment (not a bare run), and a deal with no scenario.
    const blockedLocked = await store.createDeal({ startedBy: "seller", seller: slab.seller, buyer: slab.buyer, scenario: "fake-slab" });
    await store.saveCard({ ...slab.cards[0]!, dealId: blockedLocked.id, version: 1, lockedAt: null });
    await store.transition(blockedLocked.id, "LISTED", "system", "Listed.");
    await store.transition(blockedLocked.id, "REVIEWED", "system", "Reviewed.");
    await store.lockCard(blockedLocked.id, 1);
    await store.transition(blockedLocked.id, "BLOCKED", "buyer_pal", "Stopped late.");
    const noScenario = await store.createDeal({ startedBy: "seller", seller: clean.seller });
    await store.transition(noScenario.id, "CANCELLED", "seller", "Never mind.");

    // explainDeal names the factors: the judge's run passes every rule, the real in-flight deal fails on state.
    const whyJudge = await explainDeal(db, judge.id, CURRENT);
    expect(whyJudge).toMatchObject({ found: true, scenario: "fake-slab", state: "BLOCKED", lockedCardVersion: null, cardCount: 1, paymentOrderIds: [], seedVersion: null, candidate: true });
    const whyReal = await explainDeal(db, real.id, CURRENT);
    expect(whyReal.candidate).toBe(false);
    expect(whyReal.checks.filter((c) => !c.pass).map((c) => c.rule)).toEqual(["state in COMPLETE, BLOCKED, ISSUE", "FIXTURE- payment, or no payment and no locked card"]);
    expect((await explainDeal(db, "00000000-0000-4000-8000-000000000000")).found).toBe(false);

    const preview = await deleteSeededDemoDeals(db, { dryRun: true, keepSeedVersion: CURRENT });
    expect(preview.deleted).toBe(0);
    // All deals here share one replay instant, so compare as a set rather than by creation order.
    const byId = (rows: Array<[string, ...unknown[]]>) => [...rows].sort((a, b) => a[0].localeCompare(b[0]));
    expect(byId(preview.candidates.map((c) => [c.id, c.scenario, c.state, c.seedVersion, c.reason]))).toEqual(
      byId([
        [judge.id, "fake-slab", "BLOCKED", null, "no payment and no locked card"],
        [stale.id, "clean-ps5", "COMPLETE", "2026-10-07.3", "fixture payment"],
        [issue.id, "empty-box", "ISSUE", null, "no payment and no locked card"],
      ]),
    );
    expect(await store.getDeal(judge.id)).not.toBeNull();

    const result = await deleteSeededDemoDeals(db, { dryRun: false, keepSeedVersion: CURRENT });
    expect(result.deleted).toBe(3);
    for (const gone of [judge.id, stale.id, issue.id]) expect(await store.getDeal(gone)).toBeNull();
    for (const kept of [current.id, real.id, realDone.id, blockedLocked.id, noScenario.id]) expect(await store.getDeal(kept)).not.toBeNull();

    // Children went with the deal; the kept deals keep theirs.
    expect(await store.listEvents(judge.id)).toEqual([]);
    expect(await store.listCards(judge.id)).toEqual([]);
    expect(await store.getPaymentByOrderId("FIXTURE-ORDER-STALE")).toBeNull();
    expect(await store.getPaymentByOrderId("FIXTURE-ORDER-CURRENT")).not.toBeNull();
    expect(await store.getPaymentByOrderId("5O190127TN364715T")).not.toBeNull();

    // Without --keep-seed the current seed goes too; a second run with it finds nothing.
    expect(await deleteSeededDemoDeals(db, { dryRun: false, keepSeedVersion: CURRENT })).toEqual({ candidates: [], deleted: 0 });
    const all = await deleteSeededDemoDeals(db, { dryRun: true, keepSeedVersion: null });
    expect(all.candidates.map((c) => c.id)).toEqual([current.id]);
  }, 90_000);
});
