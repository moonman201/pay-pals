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
let store: PayPalsStore;

beforeAll(async () => {
  client = new PGlite();
  const db = drizzle(client, { schema });
  // The same bundled migrator production uses, not drizzle's folder reader.
  await runMigrations(db);
  store = createPostgresDealStoreFromDb(db);
}, 60_000);

afterAll(async () => {
  await client?.close();
});

runDealStoreConformance("postgres (pglite)", async () => store);

describe("postgres store on pglite", () => {
  it("answers not-found for ids that are not uuids instead of throwing", async () => {
    expect(await store.getDeal("not-a-uuid")).toBeNull();
    expect(await store.getPayment("not-a-uuid")).toBeNull();
    expect(await store.listEvents("not-a-uuid")).toEqual([]);
  });

  it("stores prices as integer cents", async () => {
    const { getFixture } = await import("@pay-pals/contracts");
    const fx = getFixture("clean-garmin");
    const deal = await store.createDeal({ seller: fx.seller });
    await store.saveCard({ ...fx.cards[0]!, dealId: deal.id, version: 1, askingPrice: 475.5, lockedAt: null });
    const rows = await client.query<{ asking_price_cents: number }>("select asking_price_cents from item_cards where deal_id = $1", [deal.id]);
    expect(rows.rows[0]?.asking_price_cents).toBe(47550);
  });
});
