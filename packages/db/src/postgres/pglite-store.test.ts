/**
 * Runs the conformance suite against the Postgres repositories on PGlite, an
 * in-process Postgres. No server, no keys, real SQL through the real
 * migration. This is what CI runs; DATABASE_URL covers a hosted database.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../../schema";
import { runDealStoreConformance } from "../conformance/deal-store.conformance";
import type { PayPalsStore } from "@pay-pals/contracts";
import { runMigrations } from "./migrate";
import { createPostgresDealStoreFromDb } from "./postgres-store";

let client: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;
let store: PayPalsStore;

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  // The same bundled migrator production uses, not drizzle's folder reader.
  await runMigrations(db);
  store = createPostgresDealStoreFromDb(db);
}, 60_000);

afterAll(async () => {
  await client?.close();
});

// One database for the whole suite; a store per call so a test can bring its own clock.
runDealStoreConformance("postgres (pglite)", async (options) => (options ? createPostgresDealStoreFromDb(db, options) : store));

describe("postgres store on pglite", () => {
  it("answers not-found for ids that are not uuids instead of throwing", async () => {
    expect(await store.getDeal("not-a-uuid")).toBeNull();
    expect(await store.getPayment("not-a-uuid")).toBeNull();
    expect(await store.listEvents("not-a-uuid")).toEqual([]);
  });

  it("stores prices as integer cents", async () => {
    const { getFixture } = await import("@pay-pals/contracts");
    const fx = getFixture("clean-ps5");
    const deal = await store.createDeal({ startedBy: "seller", seller: fx.seller });
    await store.saveCard({ ...fx.cards[0]!, dealId: deal.id, version: 1, askingPrice: 475.5, lockedAt: null });
    const rows = await client.query<{ asking_price_cents: number }>("select asking_price_cents from item_cards where deal_id = $1", [deal.id]);
    expect(rows.rows[0]?.asking_price_cents).toBe(47550);
  });

  // The outcome column is bare text with no enum and no check constraint, so the
  // third arrival value needs no migration. This reads the column itself rather
  // than the payload, because the payload would round-trip any string at all.
  it("writes every arrival outcome to the outcome column as it stands, inconclusive included", async () => {
    const { ARRIVAL_OUTCOMES, getFixture } = await import("@pay-pals/contracts");
    const fx = getFixture("clean-ps5");
    for (const outcome of ARRIVAL_OUTCOMES) {
      const deal = await store.createDeal({ startedBy: "seller", seller: fx.seller });
      await store.saveArrivalCheck({
        dealId: deal.id,
        cardVersion: 1,
        outcome,
        mismatches: [],
        ...(outcome === "inconclusive"
          ? { unsettled: [{ field: "serial" as const, expected: "AJ164952580", observed: "AJ16495258O", explanation: "One character apart, which is the shape of a misread." }] }
          : {}),
        observed: { brand: "Sony", model: "CFI-1015A", serial: "AJ164952580" },
        palMessage: `Arrival check recorded as ${outcome}.`,
        createdAt: "2026-10-26T16:00:00.000Z",
      });
      const rows = await client.query<{ outcome: string }>("select outcome from verdicts where deal_id = $1 and kind = 'arrival'", [deal.id]);
      expect(rows.rows.map((r) => r.outcome)).toEqual([outcome]);
    }
  });
});
