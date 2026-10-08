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

/** 0003 adds deal_events.hash as nullable; 0004 makes it NOT NULL. The code backfill must run between them. */
const HASH_COLUMN_MIGRATION = "0003";

const toMeta = ({ sql, bps, folderMillis, hash }: (typeof MIGRATIONS)[number]): MigrationMeta => ({ sql: [...sql], bps, folderMillis, hash });

export async function runMigrations(db: Db, options: RunMigrationsOptions = {}): Promise<void> {
  const { dialect, session } = db as unknown as MigratableDb;
  const stopAt = options.through ? MIGRATIONS.findIndex((m) => m.tag === options.through) : MIGRATIONS.length - 1;
  if (stopAt < 0) throw new Error(`Unknown migration tag ${options.through}`);
  const hashAt = MIGRATIONS.findIndex((m) => m.tag.startsWith(HASH_COLUMN_MIGRATION));

  // Up to and including the migration that adds the hash column.
  const firstStop = Math.min(stopAt, hashAt);
  await dialect.migrate(MIGRATIONS.slice(0, firstStop + 1).map(toMeta), session, CONFIG);
  if (stopAt < hashAt) return;

  // Events written before 0003 have no hash. The chain is computed in code
  // (same hashEvent as contracts), not in SQL, so it runs here, before the
  // migration that makes the column NOT NULL. Drizzle skips migrations it
  // has already recorded, so passing the later ones alone is safe.
  await backfillEventHashes(db);
  if (stopAt > hashAt) await dialect.migrate(MIGRATIONS.slice(hashAt + 1, stopAt + 1).map(toMeta), session, CONFIG);
}
