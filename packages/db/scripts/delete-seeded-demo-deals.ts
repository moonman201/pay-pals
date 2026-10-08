/**
 * Deletes the seeded demo deals from DATABASE_URL so a redeploy can re-seed
 * them. Lists what it would delete and does nothing unless --yes is given.
 *   npm run db:delete-seeded-demo-deals -w packages/db          (list only)
 *   npm run db:delete-seeded-demo-deals -w packages/db -- --yes (delete)
 */
import { loadEnvLocal } from "../src/load-env";
import { connectPostgres } from "../src/postgres/db";
import { deleteSeededDemoDeals } from "../src/postgres/delete-seeded-demo-deals";

loadEnvLocal();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local (see .env.example).");
  process.exit(2);
}
const yes = process.argv.includes("--yes");

const connection = connectPostgres(url);
(async () => {
  const preview = await deleteSeededDemoDeals(connection.db, { dryRun: true });
  if (preview.candidates.length === 0) {
    console.log("No seeded demo deals older than one hour found. Nothing to delete.");
    return;
  }
  console.log(`${preview.candidates.length} seeded demo deal(s)${yes ? " to delete" : " would be deleted (add --yes to delete)"}:`);
  for (const c of preview.candidates) console.log(`  ${c.id}  ${c.scenario}  ${c.state}  created ${c.createdAt}  (${c.reason})`);
  if (!yes) return;
  const result = await deleteSeededDemoDeals(connection.db, { dryRun: false });
  console.log(`Deleted ${result.deleted} deal(s); cards, messages, events, payments, shipments and evidence went with them.`);
})()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => connection.close());
