/**
 * Deletes finished demo deals from DATABASE_URL so a redeploy can re-seed
 * them. Lists what it would delete and does nothing unless --yes is given.
 * Seeds stamped with the current seed version are kept when the version is
 * passed with --keep-seed.
 *   npm run db:delete-seeded-demo-deals -w packages/db -- --keep-seed 2026-10-08.1            (list only)
 *   npm run db:delete-seeded-demo-deals -w packages/db -- --keep-seed 2026-10-08.1 --yes      (delete)
 * Without --keep-seed every finished scenario deal that qualifies is listed, stamped or not.
 */
import { loadEnvLocal } from "../src/load-env";
import { connectPostgres } from "../src/postgres/db";
import { deleteSeededDemoDeals, explainDeal } from "../src/postgres/delete-seeded-demo-deals";

loadEnvLocal();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local (see .env.example).");
  process.exit(2);
}

const argv = process.argv.slice(2);
const yes = argv.includes("--yes");
const keepIndex = argv.indexOf("--keep-seed");
const keepSeedVersion = keepIndex >= 0 ? argv[keepIndex + 1] : argv.find((a) => a.startsWith("--keep-seed="))?.slice("--keep-seed=".length);
if (keepIndex >= 0 && !keepSeedVersion) {
  console.error("--keep-seed needs a version, for example --keep-seed 2026-10-08.1");
  process.exit(2);
}

const explainIndex = argv.indexOf("--explain");
const explainId = explainIndex >= 0 ? argv[explainIndex + 1] : undefined;

const connection = connectPostgres(url);
(async () => {
  const options = { keepSeedVersion: keepSeedVersion ?? null };
  if (explainId) {
    // --explain <dealId>: every factor for one deal, for when a hosted row is not where you expect it.
    const why = await explainDeal(connection.db, explainId, options.keepSeedVersion);
    if (!why.found) {
      console.log(`Deal ${explainId} not found.`);
      return;
    }
    console.log(`Deal ${explainId}: scenario ${why.scenario ?? "none"}, state ${why.state}, locked card ${why.lockedCardVersion ?? "none"}, ${why.cardCount} card(s), payments [${why.paymentOrderIds.join(", ")}], seed ${why.seedVersion ?? "none"}`);
    for (const c of why.checks) console.log(`  ${c.pass ? "pass" : "FAIL"}  ${c.rule}`);
    console.log(why.candidate ? "  => candidate" : "  => not a candidate");
    return;
  }
  const preview = await deleteSeededDemoDeals(connection.db, { ...options, dryRun: true });
  console.log(keepSeedVersion ? `Keeping seeds stamped ${keepSeedVersion}.` : "No --keep-seed given: stamped seeds are not kept.");
  if (preview.candidates.length === 0) {
    console.log("No finished demo deals to delete.");
    return;
  }
  console.log(`${preview.candidates.length} finished demo deal(s)${yes ? " to delete" : " would be deleted (add --yes to delete)"}:`);
  for (const c of preview.candidates) {
    console.log(`  ${c.id}  ${c.scenario}  ${c.state}  created ${c.createdAt}  seed ${c.seedVersion ?? "none"}  (${c.reason})`);
  }
  if (!yes) return;
  const result = await deleteSeededDemoDeals(connection.db, { ...options, dryRun: false });
  console.log(`Deleted ${result.deleted} deal(s); cards, messages, events, payments, shipments and evidence went with them.`);
})()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => connection.close());
