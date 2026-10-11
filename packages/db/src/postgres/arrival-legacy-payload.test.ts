/**
 * Arrival checks stored before contracts v1.8.0 carry `matches` and no
 * `outcome`, because the field was renamed rather than added. The payload is
 * cast and not parsed, so nothing throws on the way out and a reader would see
 * `outcome: undefined` under a type that says it cannot be.
 *
 * These payloads are hand-built: no fixture produces the old shape any more,
 * which is the reason to pin the translation here rather than trust a fixture
 * to keep covering it. The rows are written with raw SQL for the same reason,
 * since saveArrivalCheck only writes the current shape.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ARRIVAL_OUTCOMES, getFixture } from "@pay-pals/contracts";
import type { PayPalsStore } from "@pay-pals/contracts";
import * as schema from "../../schema";
import { runMigrations } from "./migrate";
import { createPostgresDealStoreFromDb } from "./postgres-store";

const clean = getFixture("clean-ps5");

/** An arrival payload in the pre-v1.8.0 shape: `matches`, never `outcome`. */
function legacyPayload(dealId: string, matches: boolean) {
  return {
    dealId,
    cardVersion: 1,
    matches,
    mismatches: matches ? [] : [{ field: "serial", expected: "AJ164952580", observed: "AJ204567113", explanation: "A different serial." }],
    observed: { brand: "Sony", model: "CFI-1015A", serial: matches ? "AJ164952580" : "AJ204567113" },
    palMessage: matches ? "This is the console on the card." : "This is not the console on the card.",
    createdAt: "2026-10-09T16:00:00.000Z",
  };
}

describe("arrival checks stored before the three-value outcome", () => {
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

  /** Writes one arrival row with an arbitrary payload, the way a past release left it. */
  async function storedArrival(payload: unknown, outcomeColumn: string) {
    const deal = await store.createDeal({ startedBy: "buyer", seller: clean.seller, buyer: clean.buyer, scenario: "clean-ps5" });
    await client.query(
      `insert into verdicts (deal_id, kind, card_version, outcome, payload) values ($1, 'arrival', 1, $2, $3::jsonb)`,
      [deal.id, outcomeColumn, JSON.stringify(payload)],
    );
    return deal.id;
  }

  it("reads a legacy matches: true as match and matches: false as mismatch", async () => {
    const trueId = await storedArrival(legacyPayload("placeholder", true), "match");
    const falseId = await storedArrival(legacyPayload("placeholder", false), "mismatch");

    const matched = await store.getArrivalCheck(trueId);
    expect(matched?.outcome).toBe("match");
    const mismatched = await store.getArrivalCheck(falseId);
    expect(mismatched?.outcome).toBe("mismatch");

    // The rest of the stored check is handed back untouched.
    expect(mismatched?.mismatches).toHaveLength(1);
    expect(mismatched?.palMessage).toBe("This is not the console on the card.");
    expect(mismatched?.observed.serial).toBe("AJ204567113");
  });

  it("drops the old field, so a reader cannot pick up matches by accident", async () => {
    const id = await storedArrival(legacyPayload("placeholder", true), "match");
    const check = await store.getArrivalCheck(id);
    expect(check).not.toBeNull();
    expect(Object.keys(check!)).not.toContain("matches");
    expect((check as unknown as { matches?: unknown }).matches).toBeUndefined();
  });

  it("never reads an unrecognised payload as match, because that would be a claim the row never made", async () => {
    // Neither field, an outcome that is not one of the three, and a payload that is not an object.
    const neither = await storedArrival({ dealId: "placeholder", cardVersion: 1, mismatches: [], observed: { brand: null, model: null, serial: null }, palMessage: "Unknown.", createdAt: "2026-10-09T16:00:00.000Z" }, "match");
    const nonsense = await storedArrival({ ...legacyPayload("placeholder", true), matches: undefined, outcome: "banana" }, "match");
    const notAnObject = await storedArrival("not an object", "match");

    for (const id of [neither, nonsense, notAnObject]) {
      const check = await store.getArrivalCheck(id);
      expect(check?.outcome, id).toBe("inconclusive");
    }
  });

  it("leaves a current-shape payload exactly as stored, for all three values", async () => {
    for (const outcome of ARRIVAL_OUTCOMES) {
      const payload = {
        dealId: "placeholder",
        cardVersion: 1,
        outcome,
        mismatches: [],
        ...(outcome === "inconclusive" ? { unsettled: [{ field: "serial", expected: "AJ164952580", observed: "AJ16495258O", explanation: "One character apart." }] } : {}),
        observed: { brand: "Sony", model: "CFI-1015A", serial: "AJ164952580" },
        palMessage: `Recorded as ${outcome}.`,
        createdAt: "2026-10-09T16:00:00.000Z",
      };
      const id = await storedArrival(payload, outcome);
      const check = await store.getArrivalCheck(id);
      expect(check?.outcome, outcome).toBe(outcome);
      expect(check, outcome).toEqual(payload);
    }
  });

  it("translates the payload and leaves the legacy outcome column as it was written", async () => {
    // The column is write-only today. If anything starts reading it, a legacy
    // row's column and its translated payload are two separate answers.
    const id = await storedArrival({ ...legacyPayload("placeholder", true), matches: undefined }, "match");
    expect((await store.getArrivalCheck(id))?.outcome).toBe("inconclusive");
    const column = await client.query<{ outcome: string }>("select outcome from verdicts where deal_id = $1", [id]);
    expect(column.rows[0]?.outcome).toBe("match");
  });
});
