/**
 * Reads packages/db/drizzle (the source of truth) and renders it as the
 * TypeScript module the migrator runs from. Used by scripts/generate-migrations.ts
 * and by the test that fails when the generated module is stale. The store
 * itself never imports this file, so it carries no filesystem access into a
 * server bundle.
 *
 * The shape and the hash match what drizzle-orm's readMigrationFiles builds,
 * so a database migrated earlier with drizzle-kit or the folder-based
 * migrator is recognized as already up to date.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DRIZZLE_FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "drizzle");
export const GENERATED_MODULE = resolve(dirname(fileURLToPath(import.meta.url)), "migrations.generated.ts");

export interface BundledMigration {
  tag: string;
  sql: string[];
  bps: boolean;
  folderMillis: number;
  hash: string;
}

interface Journal {
  entries: Array<{ tag: string; when: number; breakpoints: boolean }>;
}

export function readMigrations(folder: string = DRIZZLE_FOLDER): BundledMigration[] {
  const journal = JSON.parse(readFileSync(join(folder, "meta", "_journal.json"), "utf8")) as Journal;
  return journal.entries.map((entry) => {
    const query = readFileSync(join(folder, `${entry.tag}.sql`), "utf8");
    return {
      tag: entry.tag,
      sql: query.split("--> statement-breakpoint"),
      bps: entry.breakpoints,
      folderMillis: entry.when,
      hash: createHash("sha256").update(query).digest("hex"),
    };
  });
}

export function renderMigrationsModule(folder: string = DRIZZLE_FOLDER): string {
  const migrations = readMigrations(folder);
  return [
    "/**",
    " * GENERATED FILE. Do not edit. Source of truth: packages/db/drizzle.",
    " * Regenerate with: npm run db:bundle -w packages/db",
    " * (npm run db:generate does both drizzle-kit generate and this step.)",
    " */",
    'import type { BundledMigration } from "./migrations-source";',
    "",
    `export const MIGRATIONS: readonly BundledMigration[] = ${JSON.stringify(migrations, null, 2)};`,
    "",
  ].join("\n");
}
