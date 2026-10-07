/**
 * Database handle types and the node-postgres connection. Repositories take
 * a Db so the same code runs on a pg Pool (Neon in production) and on PGlite
 * in tests.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "../../schema";
import { runMigrations } from "./migrate";

export type Schema = typeof schema;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<PgQueryResultHKT, Schema, any>;

export interface PostgresConnection {
  db: Db;
  /** Applies bundled migrations that have not run yet. Needs no files on disk. */
  migrate(): Promise<void>;
  close(): Promise<void>;
}

export function connectPostgres(databaseUrl: string): PostgresConnection {
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  const db = drizzle(pool, { schema });
  return {
    db,
    migrate: () => runMigrations(db),
    close: () => pool.end(),
  };
}
