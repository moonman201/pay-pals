/**
 * Removes finished demo deals from a database before a redeploy re-seeds
 * them. A candidate is a deal with a scenario set, in COMPLETE, BLOCKED or
 * ISSUE, that either has a payment whose paypal_order_id starts with
 * "FIXTURE-" or has no payment and no locked card, and whose deal_created
 * event does not carry data.seedVersion equal to keepSeedVersion. So the
 * current seeds stay and every other finished scenario deal goes,
 * including a judge's own run that ended in BLOCKED. Real deals carry real
 * PayPal order ids or are still in flight and stay. Children go with the
 * deal through the schema's ON DELETE CASCADE.
 *
 * dryRun lists the candidates without deleting. explainDeal shows every
 * factor for one deal, for when a row on the hosted database is not where
 * you expect it. The script in scripts/delete-seeded-demo-deals.ts wraps
 * both with a --yes guard.
 */
import { and, eq, exists, inArray, isNotNull, isNull, not, or, sql } from "drizzle-orm";
import { deals, itemCards, payments } from "../../schema";
import type { Db } from "./db";

export const FINISHED_STATES = ["COMPLETE", "BLOCKED", "ISSUE"] as const;
export const FIXTURE_ORDER_PREFIX = "FIXTURE-";

export interface SeededDealCandidate {
  id: string;
  scenario: string;
  state: string;
  createdAt: string;
  /** data.seedVersion from the deal_created event, or null when unstamped. */
  seedVersion: string | null;
  reason: "fixture payment" | "no payment and no locked card";
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

function candidateFilter(db: Db, keepSeedVersion: string | null | undefined) {
  const anyPayment = db.select({ one: sql`1` }).from(payments).where(eq(payments.dealId, deals.id));
  const fixturePayment = db
    .select({ one: sql`1` })
    .from(payments)
    .where(and(eq(payments.dealId, deals.id), sql`${payments.paypalOrderId} like ${`${FIXTURE_ORDER_PREFIX}%`}`));
  const conditions = [
    isNotNull(deals.scenario),
    inArray(deals.state, [...FINISHED_STATES]),
    or(exists(fixturePayment), and(not(exists(anyPayment)), isNull(deals.lockedCardVersion))),
  ];
  if (keepSeedVersion) conditions.push(sql`${seedVersionOf} is distinct from ${keepSeedVersion}`);
  return { where: and(...conditions), fixturePayment };
}

export async function deleteSeededDemoDeals(db: Db, options: DeleteSeededOptions): Promise<DeleteSeededResult> {
  const { where, fixturePayment } = candidateFilter(db, options.keepSeedVersion);
  const rows = await db
    .select({
      id: deals.id,
      scenario: deals.scenario,
      state: deals.state,
      createdAt: deals.createdAt,
      seedVersion: seedVersionOf,
      hasFixturePayment: sql<boolean>`exists (${fixturePayment})`,
    })
    .from(deals)
    .where(where)
    .orderBy(deals.createdAt, deals.id);

  const candidates: SeededDealCandidate[] = rows.map((r) => ({
    id: r.id,
    scenario: r.scenario ?? "",
    state: r.state,
    createdAt: r.createdAt.toISOString(),
    seedVersion: r.seedVersion ?? null,
    reason: r.hasFixturePayment ? "fixture payment" : "no payment and no locked card",
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
  const hasFixture = orders.some((o) => o.startsWith(FIXTURE_ORDER_PREFIX));
  const checks = [
    { rule: "scenario is set", pass: deal.scenario !== null },
    { rule: `state in ${FINISHED_STATES.join(", ")}`, pass: (FINISHED_STATES as readonly string[]).includes(deal.state) },
    { rule: "FIXTURE- payment, or no payment and no locked card", pass: hasFixture || (orders.length === 0 && deal.lockedCardVersion === null) },
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
