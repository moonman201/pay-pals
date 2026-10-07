/**
 * Gives hashes to events written before the chain existed (migration 0003
 * adds prev_hash and hash as nullable columns). Per deal, with the deal row
 * locked, it recomputes the whole chain in (at, id) order with the same
 * hashEvent from contracts the stores use, and writes any row whose stored
 * link differs. Safe to run again: a fully chained deal is left alone.
 *
 * runMigrations calls this after the SQL migrations, so migrate() leaves no
 * unhashed rows behind. npm run db:backfill-hashes -w packages/db runs it
 * on its own against DATABASE_URL.
 */
import { asc, eq, isNull } from "drizzle-orm";
import { dealEvents, deals } from "../../schema";
import { chainNext } from "../event-chain";
import type { Db } from "./db";

export interface BackfillResult {
  dealsTouched: number;
  eventsUpdated: number;
}

export async function backfillEventHashes(db: Db): Promise<BackfillResult> {
  const pending = await db.selectDistinct({ dealId: dealEvents.dealId }).from(dealEvents).where(isNull(dealEvents.hash));
  const result: BackfillResult = { dealsTouched: 0, eventsUpdated: 0 };
  for (const { dealId } of pending) {
    const updated = await db.transaction(async (tx) => {
      await tx.select({ id: deals.id }).from(deals).where(eq(deals.id, dealId)).for("update");
      const rows = await tx.select().from(dealEvents).where(eq(dealEvents.dealId, dealId)).orderBy(asc(dealEvents.at), asc(dealEvents.id));
      let prev: string | null = null;
      let count = 0;
      for (const row of rows) {
        const link = chainNext(prev, {
          dealId: row.dealId,
          kind: row.kind,
          actor: row.actor,
          summary: row.summary,
          fromState: row.fromState ?? undefined,
          toState: row.toState ?? undefined,
          data: row.data ?? undefined,
          at: row.at.toISOString(),
        });
        if (row.hash !== link.hash || row.prevHash !== link.prevHash) {
          await tx.update(dealEvents).set({ prevHash: link.prevHash, hash: link.hash }).where(eq(dealEvents.id, row.id));
          count += 1;
        }
        prev = link.hash;
      }
      return count;
    });
    result.dealsTouched += 1;
    result.eventsUpdated += updated;
  }
  return result;
}
