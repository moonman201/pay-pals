/**
 * Timeline repository: append-only deal events. Ids are time-ordered so
 * events written in the same millisecond list in insertion order.
 */
import { asc, eq } from "drizzle-orm";
import type { DealEvent } from "@pay-pals/contracts";
import { dealEvents } from "../../schema";
import type { Db } from "./db";
import { forDeal } from "./deal-guard";
import { toEvent, toEventRow } from "./mappers";
import { isUuid, uuidv7 } from "./uuid";

export function eventsRepo(db: Db) {
  return {
    async appendEvent(event: Omit<DealEvent, "id">): Promise<DealEvent> {
      return forDeal(event.dealId, async () => {
        const [row] = await db.insert(dealEvents).values({ id: uuidv7(), ...toEventRow(event) }).returning();
        return toEvent(row!);
      });
    },

    async listEvents(dealId: string): Promise<DealEvent[]> {
      if (!isUuid(dealId)) return [];
      const rows = await db.select().from(dealEvents).where(eq(dealEvents.dealId, dealId)).orderBy(asc(dealEvents.at), asc(dealEvents.id));
      return rows.map(toEvent);
    },
  };
}
