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
import * as schema from "../../schema";
import { runMigrations } from "./migrate";
import { MIGRATIONS } from "./migrations.generated";
import { DRIZZLE_FOLDER, GENERATED_MODULE, renderMigrationsModule } from "./migrations-source";

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

        await runMigrations(db);

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
