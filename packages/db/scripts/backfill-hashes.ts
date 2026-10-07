/**
 * Hashes any deal events that predate the hash chain, on DATABASE_URL.
 * migrate() already does this; this script exists for running it alone.
 *   npm run db:backfill-hashes -w packages/db
 */
import { loadEnvLocal } from "../src/load-env";
import { backfillEventHashes } from "../src/postgres/backfill-hashes";
import { connectPostgres } from "../src/postgres/db";

loadEnvLocal();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local (see .env.example).");
  process.exit(2);
}

const connection = connectPostgres(url);
backfillEventHashes(connection.db)
  .then((r) => console.log(`Backfilled ${r.eventsUpdated} events across ${r.dealsTouched} deals.`))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => connection.close());
