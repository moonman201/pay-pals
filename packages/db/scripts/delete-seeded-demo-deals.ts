/**
 * Deletes demo deals from DATABASE_URL so a redeploy can re-seed them. Two
 * modes, and neither deletes anything without --yes.
 *
 * The sweep takes deals carrying our seed stamp, so a judge's own run stays.
 * Seeds stamped with the current version are kept when it is passed with
 * --keep-seed.
 *   npm run db:delete-seeded-demo-deals -w packages/db -- --keep-seed 2026-10-08.1            (list only)
 *   npm run db:delete-seeded-demo-deals -w packages/db -- --keep-seed 2026-10-08.1 --yes      (delete)
 *   npm run db:delete-seeded-demo-deals -w packages/db -- --explain <dealId>                  (one deal, every factor)
 * Without --keep-seed every finished stamped scenario deal is listed, the current seeds included.
 *
 * --id removes named deals the sweep will not touch, such as a smoke-test
 * deal or an abandoned probe. Each id is spelled out in full and matched
 * exactly; there is no prefix or pattern form. One unknown id refuses the
 * whole call.
 *   npm run db:delete-seeded-demo-deals -w packages/db -- --id <uuid> --id <uuid>              (list only)
 *   npm run db:delete-seeded-demo-deals -w packages/db -- --id <uuid> --id <uuid> --yes        (delete)
 *
 * Argument handling lives in src/postgres/delete-cli-args.ts, where it is tested.
 */
import { loadEnvLocal } from "../src/load-env";
import { connectPostgres } from "../src/postgres/db";
import { deleteDealsById } from "../src/postgres/delete-deals-by-id";
import { deleteSeededDemoDeals, explainDeal } from "../src/postgres/delete-seeded-demo-deals";
import { parseDeleteCliArgs } from "../src/postgres/delete-cli-args";

loadEnvLocal();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local (see .env.example).");
  process.exit(2);
}

const args = parseDeleteCliArgs(process.argv.slice(2));
if (args.mode === "error") {
  console.error(args.message);
  process.exit(2);
}

const CASCADE_NOTE = "cards, messages, events, verdicts, payments, shipments and evidence went with them";

const connection = connectPostgres(url);
(async () => {
  if (args.mode === "explain") {
    // Every factor for one deal, for when a hosted row is not where you expect it.
    const why = await explainDeal(connection.db, args.dealId, args.keepSeedVersion);
    if (!why.found) {
      console.log(`Deal ${args.dealId} not found.`);
      return;
    }
    console.log(`Deal ${args.dealId}: scenario ${why.scenario ?? "none"}, state ${why.state}, locked card ${why.lockedCardVersion ?? "none"}, ${why.cardCount} card(s), payments [${why.paymentOrderIds.join(", ")}], seed ${why.seedVersion ?? "none"}`);
    for (const c of why.checks) console.log(`  ${c.pass ? "pass" : "FAIL"}  ${c.rule}`);
    console.log(why.candidate ? "  => candidate" : "  => not a candidate");
    return;
  }

  if (args.mode === "by-id") {
    const preview = await deleteDealsById(connection.db, { ids: args.ids, dryRun: true });
    for (const t of preview.targets) {
      if (t.refusal) console.log(`  ${t.id}  REFUSED: ${t.refusal}`);
      else console.log(`  ${t.id}  ${t.scenario ?? "no scenario"}  ${t.state}  created ${t.createdAt}  seed ${t.seedVersion ?? "none"}`);
    }
    if (preview.refused.length > 0) {
      console.error(`${preview.refused.length} of ${preview.targets.length} id(s) are not a deal in this database. Nothing was deleted.`);
      console.error("Every id must be a full uuid. A shortened id is refused, not matched as a prefix.");
      process.exitCode = 2;
      return;
    }
    if (preview.stamped.length > 0) {
      const one = preview.stamped.length === 1;
      console.log(`Warning: ${preview.stamped.length} of these carr${one ? "ies" : "y"} a seed stamp, so ${one ? "it is one" : "they are"} of our demo seeds:`);
      for (const t of preview.stamped) console.log(`  ${t.id}  seed ${t.seedVersion}`);
      console.log("Deleting a seed by id is usually a mistake. The sweep with --keep-seed is the tool for seeds.");
    }
    if (!args.yes) {
      console.log(`${preview.targets.length} deal(s) would be deleted (add --yes to delete).`);
      return;
    }
    const result = await deleteDealsById(connection.db, { ids: args.ids, dryRun: false });
    console.log(`Deleted ${result.deleted} deal(s); ${CASCADE_NOTE}.`);
    return;
  }

  const preview = await deleteSeededDemoDeals(connection.db, { keepSeedVersion: args.keepSeedVersion, dryRun: true });
  console.log(args.keepSeedVersion ? `Keeping seeds stamped ${args.keepSeedVersion}.` : "No --keep-seed given: the current seeds go too.");
  if (preview.candidates.length === 0) {
    console.log("No finished demo deals to delete.");
    return;
  }
  console.log(`${preview.candidates.length} finished demo deal(s)${args.yes ? " to delete" : " would be deleted (add --yes to delete)"}:`);
  for (const c of preview.candidates) {
    console.log(`  ${c.id}  ${c.scenario}  ${c.state}  created ${c.createdAt}  seed ${c.seedVersion}  (payment: ${c.payment})`);
  }
  if (!args.yes) return;
  const result = await deleteSeededDemoDeals(connection.db, { keepSeedVersion: args.keepSeedVersion, dryRun: false });
  console.log(`Deleted ${result.deleted} deal(s); ${CASCADE_NOTE}.`);
})()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => connection.close());
