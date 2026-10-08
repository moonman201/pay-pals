/**
 * deleteSeededDemoDeals on PGlite: two seeded demo deals go, a real deal
 * with a real-looking order id stays, a fresh seed stays, and children go
 * with their deal.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getFixture } from "@pay-pals/contracts";
import * as schema from "../../schema";
import { createReplayClock } from "../clock";
import { deleteSeededDemoDeals } from "./delete-seeded-demo-deals";
import { runMigrations } from "./migrate";
import { createPostgresDealStoreFromDb } from "./postgres-store";

const fx = getFixture("clean-ps5");
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

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

  it("deletes only the seeded demo deals older than an hour, children included", async () => {
    const old = createReplayClock(hoursAgo(3));
    const seeded = createPostgresDealStoreFromDb(db, { clock: old.clock });

    // Seeded clean deal: fixture payment.
    const clean = await seeded.createDeal({ startedBy: "buyer", seller: fx.seller, buyer: fx.buyer, scenario: "clean-ps5" });
    await seeded.saveCard({ ...fx.cards[0]!, dealId: clean.id, version: 1, lockedAt: null });
    await seeded.transition(clean.id, "LISTED", "system", "Listed.");
    await seeded.savePayment({ ...fx.payment!, dealId: clean.id, paypalOrderId: "FIXTURE-ORDER-CLEAN-TEST" });

    // Seeded scam deal: BLOCKED, no payment, no locked card.
    const scam = await seeded.createDeal({ startedBy: "buyer", seller: fx.seller, buyer: fx.buyer, scenario: "fake-slab" });
    await seeded.transition(scam.id, "INVITED", "system", "Invite sent.");
    await seeded.transition(scam.id, "REVIEWED", "buyer_pal", "Refusal reviewed.");
    await seeded.transition(scam.id, "BLOCKED", "buyer_pal", "Stopped.");

    // A real deal in a demo scenario with a real PayPal order id: must stay.
    const real = await seeded.createDeal({ startedBy: "buyer", seller: fx.seller, buyer: fx.buyer, scenario: "clean-ps5" });
    await seeded.transition(real.id, "LISTED", "system", "Listed.");
    await seeded.savePayment({ ...fx.payment!, dealId: real.id, paypalOrderId: "5O190127TN364715T", status: "CREATED", captureId: null, capturedAt: null });

    // A real BLOCKED deal that has a locked card: must stay.
    const blockedReal = await seeded.createDeal({ startedBy: "seller", seller: fx.seller, buyer: fx.buyer, scenario: "fake-slab" });
    await seeded.saveCard({ ...fx.cards[0]!, dealId: blockedReal.id, version: 1, lockedAt: null });
    await seeded.transition(blockedReal.id, "LISTED", "system", "Listed.");
    await seeded.transition(blockedReal.id, "REVIEWED", "buyer_pal", "Reviewed.");
    await seeded.lockCard(blockedReal.id, 1);
    await seeded.transition(blockedReal.id, "BLOCKED", "buyer_pal", "Stopped late.");

    // A deal with no scenario at all: must stay.
    const noScenario = await seeded.createDeal({ startedBy: "seller", seller: fx.seller });
    await seeded.savePayment({ ...fx.payment!, dealId: noScenario.id, paypalOrderId: "FIXTURE-ORDER-NO-SCENARIO" });

    // A seed from a few minutes ago: too young, must stay.
    const fresh = createPostgresDealStoreFromDb(db, { clock: createReplayClock(new Date(Date.now() - 5 * 60_000).toISOString()).clock });
    const young = await fresh.createDeal({ startedBy: "buyer", seller: fx.seller, buyer: fx.buyer, scenario: "clean-ps5" });
    await fresh.savePayment({ ...fx.payment!, dealId: young.id, paypalOrderId: "FIXTURE-ORDER-YOUNG" });

    const preview = await deleteSeededDemoDeals(db, { dryRun: true });
    expect(preview.deleted).toBe(0);
    expect(preview.candidates.map((c) => [c.id, c.scenario, c.state, c.reason])).toEqual([
      [clean.id, "clean-ps5", "LISTED", "fixture payment"],
      [scam.id, "fake-slab", "BLOCKED", "blocked without payment"],
    ]);
    expect(await seeded.getDeal(clean.id)).not.toBeNull();

    const result = await deleteSeededDemoDeals(db, { dryRun: false });
    expect(result.deleted).toBe(2);
    expect(result.candidates.map((c) => c.id)).toEqual([clean.id, scam.id]);

    expect(await seeded.getDeal(clean.id)).toBeNull();
    expect(await seeded.getDeal(scam.id)).toBeNull();
    for (const kept of [real.id, blockedReal.id, noScenario.id, young.id]) expect(await seeded.getDeal(kept)).not.toBeNull();

    // Children went with the deal.
    expect(await seeded.listEvents(clean.id)).toEqual([]);
    expect(await seeded.listCards(clean.id)).toEqual([]);
    expect(await seeded.getPayment(clean.id)).toBeNull();
    expect(await seeded.getPaymentByOrderId("FIXTURE-ORDER-CLEAN-TEST")).toBeNull();
    expect(await seeded.getPaymentByOrderId("5O190127TN364715T")).not.toBeNull();

    // Running again finds nothing.
    expect(await deleteSeededDemoDeals(db, { dryRun: false })).toEqual({ candidates: [], deleted: 0 });
  }, 60_000);
});
