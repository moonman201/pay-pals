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
});
