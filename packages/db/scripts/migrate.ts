/**
 * Applies packages/db/drizzle migrations to DATABASE_URL.
 *   npm run migrate -w packages/db
 */
import { loadEnvLocal } from "../src/load-env";
import { connectPostgres } from "../src/postgres/db";

loadEnvLocal();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local (see .env.example).");
  process.exit(2);
}

const connection = connectPostgres(url);
connection
  .migrate()
  .then(() => console.log("Migrations applied."))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => connection.close());
