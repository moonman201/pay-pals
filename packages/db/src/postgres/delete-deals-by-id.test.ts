/**
 * deleteDealsById on PGlite: named deals go, an unknown or shortened id
 * refuses the whole call, a seed stamp is reported before it goes, and the
 * children follow through the schema's cascades.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getFixture } from "@pay-pals/contracts";
import type { PayPalsStore } from "@pay-pals/contracts";
import * as schema from "../../schema";
import { deleteDealsById } from "./delete-deals-by-id";
import { runMigrations } from "./migrate";
import { createPostgresDealStoreFromDb } from "./postgres-store";

const clean = getFixture("clean-ps5");

describe("deleteDealsById", () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let store: PayPalsStore;

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await runMigrations(db);
    store = createPostgresDealStoreFromDb(db);
  }, 60_000);

  afterAll(async () => {
    await client?.close();
  });

  /** A deal in flight, the shape the stamp sweep refuses: unstamped and unfinished. */
  async function probeDeal() {
    const deal = await store.createDeal({ startedBy: "buyer", seller: clean.seller, buyer: clean.buyer, scenario: "clean-ps5" });
    await store.transition(deal.id, "LISTED", "system", "Listed.");
    return deal;
  }

  it("deletes exactly the ids it is given and leaves everything else", async () => {
    const [a, b, bystander] = [await probeDeal(), await probeDeal(), await probeDeal()];

    const preview = await deleteDealsById(db, { ids: [a.id, b.id], dryRun: true });
    expect(preview.deleted).toBe(0);
    expect(preview.refused).toEqual([]);
    expect(preview.stamped).toEqual([]);
    expect(preview.targets.map((t) => [t.id, t.scenario, t.state])).toEqual([
      [a.id, "clean-ps5", "LISTED"],
      [b.id, "clean-ps5", "LISTED"],
    ]);
    expect(await store.getDeal(a.id)).not.toBeNull();

    const result = await deleteDealsById(db, { ids: [a.id, b.id], dryRun: false });
    expect(result.deleted).toBe(2);
    expect(await store.getDeal(a.id)).toBeNull();
    expect(await store.getDeal(b.id)).toBeNull();
    expect(await store.getDeal(bystander.id)).not.toBeNull();
  });

  it("refuses the whole call when one id is unknown, so a typo cannot take the others with it", async () => {
    const keep = await probeDeal();
    const missing = "00000000-0000-4000-8000-000000000000";

    const result = await deleteDealsById(db, { ids: [keep.id, missing], dryRun: false });
    expect(result.deleted).toBe(0);
    expect(result.refused.map((t) => [t.id, t.refusal])).toEqual([[missing, "no such deal"]]);
    // The good id in the same call is reported as present and still not deleted.
    expect(result.targets.find((t) => t.id === keep.id)?.refusal).toBeNull();
    expect(await store.getDeal(keep.id)).not.toBeNull();
  });

  it("refuses a shortened id rather than matching it as a prefix", async () => {
    const keep = await probeDeal();
    const prefix = keep.id.slice(0, 8);

    const result = await deleteDealsById(db, { ids: [prefix], dryRun: false });
    expect(result.deleted).toBe(0);
    expect(result.refused.map((t) => [t.id, t.refusal])).toEqual([[prefix, "not a deal id"]]);
    expect(await store.getDeal(keep.id)).not.toBeNull();
  });

  it("reports a seed stamp before deleting it, because a seed belongs to the sweep", async () => {
    // Stamped the way the seeder does it: the deal_created event first, then the rest.
    const seeded = await store.createDeal({ startedBy: "buyer", seller: clean.seller, buyer: clean.buyer, scenario: "clean-ps5" });
    await store.appendEvent({
      dealId: seeded.id,
      kind: "deal_created",
      actor: "system",
      summary: "Seeded.",
      data: { seedVersion: "2026-10-08.1", scenario: "clean-ps5" },
      at: seeded.createdAt,
    });
    await store.transition(seeded.id, "LISTED", "system", "Listed.");

    const preview = await deleteDealsById(db, { ids: [seeded.id], dryRun: true });
    expect(preview.stamped.map((t) => [t.id, t.seedVersion])).toEqual([[seeded.id, "2026-10-08.1"]]);
    expect(preview.refused).toEqual([]);

    // Reported, not blocked: the caller may mean it.
    const result = await deleteDealsById(db, { ids: [seeded.id], dryRun: false });
    expect(result.deleted).toBe(1);
    expect(result.stamped).toHaveLength(1);
    expect(await store.getDeal(seeded.id)).toBeNull();
  });

  it("takes the deal's children with it and leaves webhook receipts alone", async () => {
    const deal = await probeDeal();
    await store.saveCard({ ...clean.cards[0]!, dealId: deal.id, version: 1, lockedAt: null });
    await store.savePayment({ ...clean.payment!, dealId: deal.id, paypalOrderId: `ORDER-${deal.id}` });
    await store.recordWebhookReceipt(`EV-${deal.id}`, "PAYMENT.CAPTURE.COMPLETED");

    const counts = async (table: string) =>
      (await client.query<{ n: number }>(`select count(*)::int as n from ${table} where deal_id = $1`, [deal.id])).rows[0]?.n;
    expect(await counts("item_cards")).toBe(1);
    expect(await counts("payments")).toBe(1);
    expect(await counts("deal_events")).toBeGreaterThan(0);

    expect((await deleteDealsById(db, { ids: [deal.id], dryRun: false })).deleted).toBe(1);

    for (const table of ["item_cards", "messages", "verdicts", "payments", "shipments", "evidence_packs", "deal_events"]) {
      expect(await counts(table), table).toBe(0);
    }
    // webhook_receipts is keyed by PayPal's event id and carries no deal id, so it stays.
    const receipts = await client.query<{ n: number }>("select count(*)::int as n from webhook_receipts where event_id = $1", [`EV-${deal.id}`]);
    expect(receipts.rows[0]?.n).toBe(1);
  });

  it("collapses a repeated id and does nothing with an empty list", async () => {
    const deal = await probeDeal();
    const twice = await deleteDealsById(db, { ids: [deal.id, deal.id], dryRun: true });
    expect(twice.targets).toHaveLength(1);

    const none = await deleteDealsById(db, { ids: [], dryRun: false });
    expect(none).toEqual({ targets: [], refused: [], stamped: [], deleted: 0 });
  });
});
