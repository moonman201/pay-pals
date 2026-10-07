/**
 * Verdicts repository: Buyer Pal reviews and arrival checks share one table,
 * told apart by kind.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import type { ArrivalCheck, Verdict } from "@pay-pals/contracts";
import { verdicts } from "../../schema";
import { DealNotFoundError } from "../errors";
import type { Db } from "./db";
import { toArrival, toArrivalRow, toVerdict, toVerdictRow } from "./mappers";
import { isUuid } from "./uuid";

export function verdictsRepo(db: Db) {
  return {
    async saveVerdict(verdict: Verdict): Promise<Verdict> {
      if (!isUuid(verdict.dealId)) throw new DealNotFoundError(verdict.dealId);
      const [row] = await db.insert(verdicts).values(toVerdictRow(verdict)).returning();
      return toVerdict(row!);
    },

    async listVerdicts(dealId: string): Promise<Verdict[]> {
      if (!isUuid(dealId)) return [];
      const rows = await db
        .select()
        .from(verdicts)
        .where(and(eq(verdicts.dealId, dealId), eq(verdicts.kind, "review")))
        .orderBy(asc(verdicts.createdAt));
      return rows.map(toVerdict);
    },

    async saveArrivalCheck(check: ArrivalCheck): Promise<ArrivalCheck> {
      if (!isUuid(check.dealId)) throw new DealNotFoundError(check.dealId);
      const [row] = await db.insert(verdicts).values(toArrivalRow(check)).returning();
      return toArrival(row!);
    },

    async getArrivalCheck(dealId: string): Promise<ArrivalCheck | null> {
      if (!isUuid(dealId)) return null;
      const [row] = await db
        .select()
        .from(verdicts)
        .where(and(eq(verdicts.dealId, dealId), eq(verdicts.kind, "arrival")))
        .orderBy(desc(verdicts.createdAt))
        .limit(1);
      return row ? toArrival(row) : null;
    },
  };
}
