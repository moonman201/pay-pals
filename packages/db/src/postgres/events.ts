/**
 * Timeline repository: append-only deal events in a hash chain. Every
 * append happens with the deal row locked, reads the current head (latest
 * event by at, then id), and writes prevHash and hash from it, so two
 * concurrent appends cannot fork the chain. transition, recordAgreement
 * and markSellerJoined call insertEvent inside their own locked
 * transactions; appendEvent opens one of its own.
 */
import { asc, desc, eq } from "drizzle-orm";
import type { DealEvent } from "@pay-pals/contracts";
import { dealEvents, deals } from "../../schema";
import { DealNotFoundError } from "../errors";
import { chainNext, type NewEvent } from "../event-chain";
import type { Db } from "./db";
import { forDeal } from "./deal-guard";
import { toEvent, toEventRow } from "./mappers";
import { isUuid, uuidv7 } from "./uuid";

/** Hash of the deal's latest event, or null when it has none. Call with the deal row locked. */
export async function chainHead(tx: Db, dealId: string): Promise<string | null> {
  const [last] = await tx
    .select({ hash: dealEvents.hash })
    .from(dealEvents)
    .where(eq(dealEvents.dealId, dealId))
    .orderBy(desc(dealEvents.at), desc(dealEvents.id))
    .limit(1);
  return last?.hash ?? null;
}

/** Inserts one event at the head of the chain. Call with the deal row locked. */
export async function insertEvent(tx: Db, event: NewEvent): Promise<DealEvent> {
  const link = chainNext(await chainHead(tx, event.dealId), event);
  const [row] = await tx
    .insert(dealEvents)
    .values({ id: uuidv7(), ...toEventRow(event), prevHash: link.prevHash, hash: link.hash })
    .returning();
  return toEvent(row!);
}

export function eventsRepo(db: Db) {
  return {
    async appendEvent(event: NewEvent): Promise<DealEvent> {
      return forDeal(event.dealId, () =>
        db.transaction(async (tx) => {
          const [deal] = await tx.select({ id: deals.id }).from(deals).where(eq(deals.id, event.dealId)).for("update");
          if (!deal) throw new DealNotFoundError(event.dealId);
          return insertEvent(tx, event);
        }),
      );
    },

    async listEvents(dealId: string): Promise<DealEvent[]> {
      if (!isUuid(dealId)) return [];
      const rows = await db.select().from(dealEvents).where(eq(dealEvents.dealId, dealId)).orderBy(asc(dealEvents.at), asc(dealEvents.id));
      return rows.map(toEvent);
    },
  };
}
