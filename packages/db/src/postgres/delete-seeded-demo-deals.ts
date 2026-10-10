/**
 * Removes seeded demo deals from a database before a redeploy re-seeds
 * them. What selects a deal is the seed stamp: the data.seedVersion our
 * seeder writes on the deal_created event. If a deal carries a stamp it is
 * ours and we may delete it; if it does not, it belongs to whoever made it
 * and it stays. A judge's own run through the demo never carries a stamp.
 *
 * The earlier rule selected on the payment instead: a paypal_order_id
 * starting with "FIXTURE-", or no payment and no locked card. That stopped
 * matching our own seeds the moment a re-seed gave them real sandbox order
 * ids, which left them undeletable. The payment is still reported on each
 * candidate, but it no longer decides anything.
 *
 * Two conditions from that rule stay on as a safety net, so a stamp alone
 * is not enough: the deal must have a scenario set and must be in COMPLETE,
 * BLOCKED or ISSUE. A stamped deal still in flight is never touched.
 *
 * Seeds stamped with keepSeedVersion are kept, so the current seeds survive
 * and only stale ones go. Children go with the deal through the schema's
 * ON DELETE CASCADE.
 *
 * dryRun lists the candidates without deleting. explainDeal shows every
 * factor for one deal, for when a row on the hosted database is not where
 * you expect it. The script in scripts/delete-seeded-demo-deals.ts wraps
 * both with a --yes guard.
 */
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { deals, itemCards, payments } from "../../schema";
import type { Db } from "./db";

export const FINISHED_STATES = ["COMPLETE", "BLOCKED", "ISSUE"] as const;
export const FIXTURE_ORDER_PREFIX = "FIXTURE-";

/** What PayPal order a candidate carries. Reported for the preview line, never a condition. */
export type CandidatePayment = "fixture order" | "real order" | "none";

export interface SeededDealCandidate {
  id: string;
  scenario: string;
  state: string;
  createdAt: string;
  /** data.seedVersion from the deal_created event. Always set: the stamp is what selects the deal. */
  seedVersion: string;
  payment: CandidatePayment;
}

export interface DeleteSeededOptions {
  dryRun: boolean;
  /** Seeds whose deal_created event carries this seedVersion are kept. Null keeps none. */
  keepSeedVersion?: string | null;
}

export interface DeleteSeededResult {
  candidates: SeededDealCandidate[];
  deleted: number;
}

/**
 * data->>'seedVersion' of the deal's first deal_created event. The outer
 * column is written out as "deals"."id": inside a select list Drizzle
 * renders ${deals.id} as a bare "id", which the subquery would resolve to
 * the event's own id and read back null.
 */
const seedVersionOf = sql<string | null>`(
  select e.data->>'seedVersion' from deal_events e
  where e.deal_id = "deals"."id" and e.kind = 'deal_created'
  order by e.at, e.id limit 1
)`;

function paymentSubqueries(db: Db) {
  const anyPayment = db.select({ one: sql`1` }).from(payments).where(eq(payments.dealId, deals.id));
  const fixturePayment = db
    .select({ one: sql`1` })
    .from(payments)
    .where(and(eq(payments.dealId, deals.id), sql`${payments.paypalOrderId} like ${`${FIXTURE_ORDER_PREFIX}%`}`));
  return { anyPayment, fixturePayment };
}

function candidateWhere(keepSeedVersion: string | null | undefined) {
  const conditions = [
    // The seed stamp: this deal is one of ours.
    sql`${seedVersionOf} is not null`,
    // Safety nets, so a stamp alone is never enough.
    isNotNull(deals.scenario),
    inArray(deals.state, [...FINISHED_STATES]),
  ];
  if (keepSeedVersion) conditions.push(sql`${seedVersionOf} is distinct from ${keepSeedVersion}`);
  return and(...conditions);
}

function classifyPayment(hasFixturePayment: boolean, hasAnyPayment: boolean): CandidatePayment {
  if (hasFixturePayment) return "fixture order";
  return hasAnyPayment ? "real order" : "none";
}

export async function deleteSeededDemoDeals(db: Db, options: DeleteSeededOptions): Promise<DeleteSeededResult> {
  const { anyPayment, fixturePayment } = paymentSubqueries(db);
  const rows = await db
    .select({
      id: deals.id,
      scenario: deals.scenario,
      state: deals.state,
      createdAt: deals.createdAt,
      seedVersion: seedVersionOf,
      hasFixturePayment: sql<boolean>`exists (${fixturePayment})`,
      hasAnyPayment: sql<boolean>`exists (${anyPayment})`,
    })
    .from(deals)
    .where(candidateWhere(options.keepSeedVersion))
    .orderBy(deals.createdAt, deals.id);

  const candidates: SeededDealCandidate[] = rows.map((r) => ({
    id: r.id,
    scenario: r.scenario ?? "",
    state: r.state,
    createdAt: r.createdAt.toISOString(),
    seedVersion: r.seedVersion ?? "",
    payment: classifyPayment(r.hasFixturePayment, r.hasAnyPayment),
  }));

  if (options.dryRun || candidates.length === 0) return { candidates, deleted: 0 };
  const gone = await db
    .delete(deals)
    .where(inArray(deals.id, candidates.map((c) => c.id)))
    .returning({ id: deals.id });
  return { candidates, deleted: gone.length };
}

export interface DealExplanation {
  found: boolean;
  scenario: string | null;
  state: string | null;
  lockedCardVersion: number | null;
  cardCount: number;
  paymentOrderIds: string[];
  seedVersion: string | null;
  /** Each rule and whether this deal passes it. */
  checks: Array<{ rule: string; pass: boolean }>;
  candidate: boolean;
}

/** Why a deal is or is not a candidate. */
export async function explainDeal(db: Db, dealId: string, keepSeedVersion?: string | null): Promise<DealExplanation> {
  const [deal] = await db.select({ scenario: deals.scenario, state: deals.state, lockedCardVersion: deals.lockedCardVersion, seedVersion: seedVersionOf }).from(deals).where(eq(deals.id, dealId));
  if (!deal) return { found: false, scenario: null, state: null, lockedCardVersion: null, cardCount: 0, paymentOrderIds: [], seedVersion: null, checks: [], candidate: false };
  const orders = (await db.select({ id: payments.paypalOrderId }).from(payments).where(eq(payments.dealId, dealId))).map((p) => p.id);
  const [cards] = await db.select({ n: sql<number>`count(*)::int` }).from(itemCards).where(eq(itemCards.dealId, dealId));
  const checks = [
    { rule: "deal_created carries a seed stamp", pass: deal.seedVersion !== null },
    { rule: "scenario is set", pass: deal.scenario !== null },
    { rule: `state in ${FINISHED_STATES.join(", ")}`, pass: (FINISHED_STATES as readonly string[]).includes(deal.state) },
    { rule: keepSeedVersion ? `seed stamp is not ${keepSeedVersion}` : "no seed version to keep", pass: !keepSeedVersion || deal.seedVersion !== keepSeedVersion },
  ];
  return {
    found: true,
    scenario: deal.scenario,
    state: deal.state,
    lockedCardVersion: deal.lockedCardVersion,
    cardCount: cards?.n ?? 0,
    paymentOrderIds: orders,
    seedVersion: deal.seedVersion ?? null,
    checks,
    candidate: checks.every((c) => c.pass),
  };
}
