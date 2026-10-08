/**
 * Removes the seeded demo deals from a database before a redeploy re-seeds
 * them. A seeded demo deal is one with a scenario set, created more than an
 * hour ago, that either has a payment whose paypal_order_id starts with
 * "FIXTURE-" or is BLOCKED with no payment and no locked card. Real deals
 * carry real PayPal order ids and are left alone. Children go with the
 * deal through the schema's ON DELETE CASCADE.
 *
 * dryRun lists the candidates without deleting. The script in
 * scripts/delete-seeded-demo-deals.ts wraps this with a --yes guard.
 */
import { and, exists, inArray, isNotNull, isNull, lt, not, or, sql } from "drizzle-orm";
import { deals, payments } from "../../schema";
import type { Db } from "./db";

export interface SeededDealCandidate {
  id: string;
  scenario: string;
  state: string;
  createdAt: string;
  reason: "fixture payment" | "blocked without payment";
}

export interface DeleteSeededOptions {
  dryRun: boolean;
  /** Only deals created before now minus this many milliseconds. Default one hour. */
  olderThanMs?: number;
  now?: () => Date;
}

export interface DeleteSeededResult {
  candidates: SeededDealCandidate[];
  deleted: number;
}

export const FIXTURE_ORDER_PREFIX = "FIXTURE-";
const ONE_HOUR = 60 * 60 * 1000;

export async function deleteSeededDemoDeals(db: Db, options: DeleteSeededOptions): Promise<DeleteSeededResult> {
  const cutoff = new Date((options.now ?? (() => new Date()))().getTime() - (options.olderThanMs ?? ONE_HOUR));
  const paymentForDeal = db.select({ one: sql`1` }).from(payments).where(sql`${payments.dealId} = ${deals.id}`);
  const fixturePaymentForDeal = db
    .select({ one: sql`1` })
    .from(payments)
    .where(and(sql`${payments.dealId} = ${deals.id}`, sql`${payments.paypalOrderId} like ${`${FIXTURE_ORDER_PREFIX}%`}`));

  const rows = await db
    .select({
      id: deals.id,
      scenario: deals.scenario,
      state: deals.state,
      createdAt: deals.createdAt,
      hasFixturePayment: sql<boolean>`exists (${fixturePaymentForDeal})`,
    })
    .from(deals)
    .where(
      and(
        isNotNull(deals.scenario),
        lt(deals.createdAt, cutoff),
        or(exists(fixturePaymentForDeal), and(sql`${deals.state} = 'BLOCKED'`, not(exists(paymentForDeal)), isNull(deals.lockedCardVersion))),
      ),
    )
    .orderBy(deals.createdAt);

  const candidates: SeededDealCandidate[] = rows.map((r) => ({
    id: r.id,
    scenario: r.scenario ?? "",
    state: r.state,
    createdAt: r.createdAt.toISOString(),
    reason: r.hasFixturePayment ? "fixture payment" : "blocked without payment",
  }));

  if (options.dryRun || candidates.length === 0) return { candidates, deleted: 0 };
  const gone = await db
    .delete(deals)
    .where(inArray(deals.id, candidates.map((c) => c.id)))
    .returning({ id: deals.id });
  return { candidates, deleted: gone.length };
}
