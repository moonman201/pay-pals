/**
 * Applies the bundled migrations to any Drizzle Postgres handle (pg or
 * PGlite). No filesystem access: the SQL comes from migrations.generated.ts,
 * so this works from a Next.js server bundle where import.meta.url points
 * into .next and the drizzle folder is not deployed.
 *
 * Drizzle's own migrate() for each driver is readMigrationFiles(folder)
 * followed by db.dialect.migrate(metas, db.session, config). This calls
 * the second half directly with the same migration shape and hashes, so the
 * __drizzle_migrations bookkeeping table stays compatible.
 */
import type { MigrationConfig, MigrationMeta } from "drizzle-orm/migrator";
import type { PgDialect, PgSession } from "drizzle-orm/pg-core";
import { backfillEventHashes } from "./backfill-hashes";
import type { Db } from "./db";
import { MIGRATIONS } from "./migrations.generated";

interface MigratableDb {
  dialect: PgDialect;
  session: PgSession;
}

export interface RunMigrationsOptions {
  /** Stop after this migration tag (for example "0001_agreement"). Tests use it to stage an older database. */
  through?: string;
}

const CONFIG: MigrationConfig = { migrationsFolder: "bundled:packages/db/drizzle" };

export async function runMigrations(db: Db, options: RunMigrationsOptions = {}): Promise<void> {
  const { dialect, session } = db as unknown as MigratableDb;
  const stopAt = options.through ? MIGRATIONS.findIndex((m) => m.tag === options.through) : MIGRATIONS.length - 1;
  if (stopAt < 0) throw new Error(`Unknown migration tag ${options.through}`);
  const metas: MigrationMeta[] = MIGRATIONS.slice(0, stopAt + 1).map(({ sql, bps, folderMillis, hash }) => ({ sql: [...sql], bps, folderMillis, hash }));
  await dialect.migrate(metas, session, CONFIG);
  // Events written before 0003 have no hash. The chain is computed in code
  // (same hashEvent as contracts), not in SQL, so it runs here after the DDL.
  if (stopAt >= MIGRATIONS.findIndex((m) => m.tag.startsWith("0003"))) await backfillEventHashes(db);
}
