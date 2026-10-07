/**
 * Applies the bundled migrations to any Drizzle Postgres handle (pg or
 * PGlite). No filesystem access: the SQL comes from migrations.generated.ts,
 * so this works from a Next.js server bundle where import.meta.url points
 * into .next and the drizzle folder is not deployed.
 *
 * Drizzle's own migrate() for each driver is readMigrationFiles(folder)
 * followed by db.dialect.migrate(migrations, db.session, config). This calls
 * the second half directly with the same migration shape and hashes, so the
 * __drizzle_migrations bookkeeping table stays compatible.
 */
import type { MigrationConfig, MigrationMeta } from "drizzle-orm/migrator";
import type { PgDialect, PgSession } from "drizzle-orm/pg-core";
import type { Db } from "./db";
import { MIGRATIONS } from "./migrations.generated";

interface MigratableDb {
  dialect: PgDialect;
  session: PgSession;
}

const CONFIG: MigrationConfig = { migrationsFolder: "bundled:packages/db/drizzle" };

export async function runMigrations(db: Db): Promise<void> {
  const { dialect, session } = db as unknown as MigratableDb;
  const metas: MigrationMeta[] = MIGRATIONS.map(({ sql, bps, folderMillis, hash }) => ({ sql: [...sql], bps, folderMillis, hash }));
  await dialect.migrate(metas, session, CONFIG);
}
