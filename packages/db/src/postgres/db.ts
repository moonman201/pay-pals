/**
 * Database handle types and the node-postgres connection. Repositories take
 * a Db so the same code runs on a pg Pool (Neon in production) and on PGlite
 * in tests.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import * as schema from "../../schema";

export type Schema = typeof schema;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<PgQueryResultHKT, Schema, any>;

export const MIGRATIONS_FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "drizzle");

export interface PostgresConnection {
  db: Db;
  /** Applies packages/db/drizzle migrations that have not run yet. */
  migrate(): Promise<void>;
  close(): Promise<void>;
}

export function connectPostgres(databaseUrl: string): PostgresConnection {
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  const db = drizzle(pool, { schema });
  return {
    db,
    migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    close: () => pool.end(),
  };
}
