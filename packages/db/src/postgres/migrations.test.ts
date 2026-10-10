/**
 * Proves the bundled migrator: the generated module matches the drizzle
 * folder, and migrating works with no access to that folder (different cwd,
 * nothing read from disk), on PGlite.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEAL_EVENT_KINDS, verifyChain } from "@pay-pals/contracts";
import * as schema from "../../schema";
import { backfillEventHashes } from "./backfill-hashes";
import { runMigrations } from "./migrate";
import { MIGRATIONS } from "./migrations.generated";
import { DRIZZLE_FOLDER, GENERATED_MODULE, renderMigrationsModule } from "./migrations-source";
import { createPostgresDealStoreFromDb } from "./postgres-store";

describe("bundled migrations", () => {
  it("generated module is up to date with packages/db/drizzle (run npm run db:bundle -w packages/db if this fails)", () => {
    expect(readFileSync(GENERATED_MODULE, "utf8")).toBe(renderMigrationsModule(DRIZZLE_FOLDER));
    expect(MIGRATIONS.length).toBeGreaterThan(0);
    expect(MIGRATIONS[0]?.tag).toBe("0000_init");
  });

  describe("from a different working directory", () => {
    const originalCwd = process.cwd();
    afterEach(() => process.chdir(originalCwd));

    it("migrates an empty database twice (second run is a no-op) without touching the drizzle folder", async () => {
      process.chdir(mkdtempSync(join(tmpdir(), "pay-pals-migrate-")));
      const client = new PGlite();
      try {
        const db = drizzle(client, { schema });
        await runMigrations(db);
        await runMigrations(db);
        const tables = await client.query<{ table_name: string }>(
          "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
        );
        expect(tables.rows.map((r) => r.table_name)).toEqual([
          "deal_events",
          "deals",
          "evidence_packs",
          "item_cards",
          "messages",
          "payments",
          "shipments",
          "verdicts",
          "webhook_receipts",
        ]);
        const applied = await client.query<{ hash: string }>("select hash from drizzle.__drizzle_migrations order by id");
        expect(applied.rows.map((r) => r.hash)).toEqual(MIGRATIONS.map((m) => m.hash));
      } finally {
        await client.close();
      }
    }, 60_000);
  });

  describe("0005_off_platform_event on a database that already has 0000 to 0004", () => {
    it("adds off_platform_chosen in front of payment_created, and only then does the enum accept it", async () => {
      const client = new PGlite();
      try {
        const db = drizzle(client, { schema });
        await runMigrations(db, { through: "0004_shipment_flags" });
        const labels = async () =>
          (
            await client.query<{ l: string }>(
              "select e.enumlabel as l from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'deal_event_kind' order by e.enumsortorder",
            )
          ).rows.map((r) => r.l);
        expect(await labels()).not.toContain("off_platform_chosen");

        const inserted = await client.query<{ id: string }>(
          `insert into deals (state, scenario, seller_name, seller_email) values ('AGREED', 'clean-ps5', 'Matt M.', 'matt@example.com') returning id`,
        );
        const dealId = inserted.rows[0]!.id;
        const writeOffPlatformEvent = () =>
          client.query(
            `insert into deal_events (deal_id, kind, actor, summary, hash)
             values ($1, 'off_platform_chosen'::deal_event_kind, 'buyer', 'The buyer chose to pay outside Goods and Services.', $2)`,
            [dealId, "hash-off-platform-chosen"],
          );
        // Before 0005 the label does not exist, so the web flow could not write the line.
        await expect(writeOffPlatformEvent()).rejects.toThrow();

        await runMigrations(db);

        // Every kind in the contract is a label on the Postgres enum, in the same order.
        // This fails if a later contract addition ever ships without its migration.
        const after = await labels();
        expect(after).toEqual([...DEAL_EVENT_KINDS]);
        expect(after.indexOf("off_platform_chosen")).toBe(after.indexOf("payment_created") - 1);

        await writeOffPlatformEvent();
        const stored = await client.query<{ kind: string }>("select kind::text as kind from deal_events where deal_id = $1", [dealId]);
        expect(stored.rows.map((r) => r.kind)).toEqual(["off_platform_chosen"]);
      } finally {
        await client.close();
      }
    }, 60_000);
  });

  describe("0003_buyer_first_history on a database shaped like the hosted one (0000 to 0002 applied)", () => {
    it("remaps the scenario, adds the columns and enum values, and hashes every existing event into a verifying chain", async () => {
      const client = new PGlite();
      try {
        const db = drizzle(client, { schema });
        await runMigrations(db, { through: "0002_scenario_ps5" });
        // Three clean-ps5 deals with the events the web flows wrote before the chain existed, plus one scam-ps5 deal.
        const dealIds: string[] = [];
        for (let d = 0; d < 3; d++) {
          const inserted = await client.query<{ id: string }>(
            `insert into deals (state, scenario, seller_name, seller_email, buyer_name, buyer_email, current_card_version, locked_card_version)
             values ('PAYMENT_PENDING', 'clean-ps5', 'Matt M.', 'matt@example.com', 'Priya S.', 'priya.s@example.com', 1, 1) returning id`,
          );
          const dealId = inserted.rows[0]!.id;
          dealIds.push(dealId);
          const base = Date.parse("2026-10-07T10:00:00.000Z") + d * 60_000;
          const rows: Array<[string, string, string, string | null, string | null, string | null]> = [
            ["deal_created", "seller", "Matt M. started a deal.", null, null, null],
            ["card_updated", "seller_pal", "Seller Pal built card version 1.", null, null, '{"version":1}'],
            ["state_changed", "system", "Listed.", "DRAFT", "LISTED", null],
            ["state_changed", "system", "Reviewed.", "LISTED", "REVIEWED", null],
            ["agreed", "buyer", "The buyer agreed to card version 1.", null, null, '{"role":"buyer","cardVersion":1}'],
            ["state_changed", "system", "Agreed.", "REVIEWED", "AGREED", null],
            ["payment_created", "paypal", "PayPal checkout order created.", null, null, null],
            ["state_changed", "system", "Payment pending.", "AGREED", "PAYMENT_PENDING", null],
          ];
          for (let i = 0; i < rows.length; i++) {
            const [kind, actor, summary, from, to, data] = rows[i]!;
            await client.query(
              `insert into deal_events (deal_id, kind, actor, summary, from_state, to_state, data, at)
               values ($1, $2::deal_event_kind, $3::actor, $4, $5::deal_state, $6::deal_state, $7::jsonb, $8)`,
              [dealId, kind, actor, summary, from, to, data, new Date(base + i * 1000).toISOString()],
            );
          }
        }
        await client.query(`insert into deals (state, scenario, seller_name, seller_email) values ('BLOCKED', 'scam-ps5', 'S', 's@example.com')`);

        await runMigrations(db);

        const scenarios = await client.query<{ scenario: string | null; n: number }>("select scenario::text, count(*)::int as n from deals group by 1 order by 1");
        expect(scenarios.rows).toEqual([
          { scenario: "clean-ps5", n: 3 },
          { scenario: "fake-slab", n: 1 },
        ]);
        const labels = async (type: string) =>
          (await client.query<{ l: string }>("select e.enumlabel as l from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = $1 order by e.enumsortorder", [type])).rows.map((r) => r.l);
        expect(await labels("scenario")).toEqual(["fake-slab", "clean-ps5", "empty-box"]);
        expect(await labels("deal_state")).toContain("INVITED");
        expect(await labels("deal_event_kind")).toEqual(expect.arrayContaining(["seller_invited", "seller_joined", "invite_declined"]));
        expect(await labels("deal_starter")).toEqual(["buyer", "seller"]);
        const started = await client.query<{ started_by: string; n: number }>("select started_by::text, count(*)::int as n from deals group by 1");
        expect(started.rows).toEqual([{ started_by: "seller", n: 4 }]);

        // Every pre-existing event is now hashed and each deal's history verifies through the store.
        const unhashed = await client.query<{ n: number }>("select count(*)::int as n from deal_events where hash is null");
        expect(unhashed.rows[0]?.n).toBe(0);
        const store = createPostgresDealStoreFromDb(db);
        for (const dealId of dealIds) {
          const events = await store.listEvents(dealId);
          expect(events).toHaveLength(8);
          expect(events.map((e) => e.kind)[0]).toBe("deal_created");
          expect(verifyChain(events).ok).toBe(true);
          // And new events continue the chain from the backfilled head.
          const next = await store.appendEvent({ dealId, kind: "payment_captured", actor: "paypal", summary: "Captured.", at: new Date().toISOString() });
          expect(next.prevHash).toBe(events[events.length - 1]?.hash);
          expect(verifyChain(await store.listEvents(dealId)).ok).toBe(true);
        }
        // Running the backfill again changes nothing.
        expect(await backfillEventHashes(db)).toEqual({ dealsTouched: 0, eventsUpdated: 0 });
      } finally {
        await client.close();
      }
    }, 90_000);
  });

  describe("0002_scenario_ps5 on a database that already has 0000 and 0001", () => {
    it("maps the old scenario values to the new ones and keeps the deal row", async () => {
      const client = new PGlite();
      try {
        const db = drizzle(client, { schema });
        await runMigrations(db, { through: "0001_agreement" });
        // What Matt's Neon database holds: one clean-garmin deal in PAYMENT_PENDING.
        await client.query(
          `insert into deals (id, state, scenario, seller_name, seller_email, buyer_name, buyer_email, current_card_version, locked_card_version)
           values ('11111111-1111-4111-8111-111111111111', 'PAYMENT_PENDING', 'clean-garmin', 'Luis O.', 'luis.o@example.com', 'Priya S.', 'priya.s@example.com', 2, 2)`,
        );
        await client.query(`insert into deals (state, scenario, seller_name, seller_email) values ('DRAFT', 'scam-garmin', 'S', 's@example.com')`);
        await client.query(`insert into deals (state, scenario, seller_name, seller_email) values ('DRAFT', 'wrong-item', 'S', 's@example.com')`);
        await client.query(`insert into deals (state, seller_name, seller_email) values ('DRAFT', 'S', 's@example.com')`);

        await runMigrations(db, { through: "0002_scenario_ps5" });

        const rows = await client.query<{ id: string; state: string; scenario: string | null; locked_card_version: number | null }>(
          "select id, state, scenario, locked_card_version from deals order by scenario::text nulls last",
        );
        expect(rows.rows.map((r) => r.scenario)).toEqual(["clean-ps5", "empty-box", "scam-ps5", null]);
        const kept = rows.rows.find((r) => r.id === "11111111-1111-4111-8111-111111111111")!;
        expect(kept).toMatchObject({ state: "PAYMENT_PENDING", scenario: "clean-ps5", locked_card_version: 2 });

        const enumValues = await client.query<{ enumlabel: string }>(
          "select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'scenario' order by e.enumsortorder",
        );
        expect(enumValues.rows.map((r) => r.enumlabel)).toEqual(["scam-ps5", "clean-ps5", "empty-box"]);
        const oldType = await client.query("select 1 from pg_type where typname = 'scenario_new'");
        expect(oldType.rows).toHaveLength(0);
        // The column accepts the new values and rejects the old ones.
        await client.query(`insert into deals (state, scenario, seller_name, seller_email) values ('DRAFT', 'clean-ps5', 'S', 's@example.com')`);
        await expect(client.query(`insert into deals (state, scenario, seller_name, seller_email) values ('DRAFT', 'clean-garmin', 'S', 's@example.com')`)).rejects.toThrow();
      } finally {
        await client.close();
      }
    }, 60_000);
  });
});
