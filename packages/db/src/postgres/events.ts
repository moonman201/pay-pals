/**
 * Timeline repository: append-only deal events.
 */
import { asc, eq } from "drizzle-orm";
import type { DealEvent } from "@pay-pals/contracts";
import { dealEvents } from "../../schema";
import { DealNotFoundError } from "../errors";
import type { Db } from "./db";
import { toEvent, toEventRow } from "./mappers";
import { isUuid } from "./uuid";

export function eventsRepo(db: Db) {
  return {
    async appendEvent(event: Omit<DealEvent, "id">): Promise<DealEvent> {
      if (!isUuid(event.dealId)) throw new DealNotFoundError(event.dealId);
      const [row] = await db.insert(dealEvents).values(toEventRow(event)).returning();
      return toEvent(row!);
    },

    async listEvents(dealId: string): Promise<DealEvent[]> {
      if (!isUuid(dealId)) return [];
      const rows = await db.select().from(dealEvents).where(eq(dealEvents.dealId, dealId)).orderBy(asc(dealEvents.at));
      return rows.map(toEvent);
    },
  };
}
