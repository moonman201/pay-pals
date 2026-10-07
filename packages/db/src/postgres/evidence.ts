/**
 * Evidence packs repository: every pack built is kept; the latest is served.
 */
import { desc, eq } from "drizzle-orm";
import type { EvidencePack } from "@pay-pals/contracts";
import { evidencePacks } from "../../schema";
import { DealNotFoundError } from "../errors";
import type { Db } from "./db";
import { toEvidence, toEvidenceRow } from "./mappers";
import { isUuid } from "./uuid";

export function evidenceRepo(db: Db) {
  return {
    async saveEvidence(pack: EvidencePack): Promise<EvidencePack> {
      if (!isUuid(pack.dealId)) throw new DealNotFoundError(pack.dealId);
      const [row] = await db.insert(evidencePacks).values(toEvidenceRow(pack)).returning();
      return toEvidence(row!);
    },

    async getEvidence(dealId: string): Promise<EvidencePack | null> {
      if (!isUuid(dealId)) return null;
      const [row] = await db
        .select()
        .from(evidencePacks)
        .where(eq(evidencePacks.dealId, dealId))
        .orderBy(desc(evidencePacks.createdAt))
        .limit(1);
      return row ? toEvidence(row) : null;
    },
  };
}
