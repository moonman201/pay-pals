/**
 * Deals repository: create, read, set buyer, and the state transition.
 * The transition locks the deal row, checks the table and appends the
 * state_changed event in one transaction.
 */
import { eq } from "drizzle-orm";
import type { CreateDealInput, Deal, DealEvent, DealState, Party } from "@pay-pals/contracts";
import { dealEvents, deals } from "../../schema";
import { agreedEvent, agreementField, assertAgreementAllowed } from "../card-rules";
import { DealNotFoundError } from "../errors";
import { planTransition } from "../state-machine";
import type { Db } from "./db";
import { toDeal, toEventRow } from "./mappers";
import { isUuid, uuidv7 } from "./uuid";

export function dealsRepo(db: Db) {
  async function lockRow(tx: Db, dealId: string) {
    if (!isUuid(dealId)) throw new DealNotFoundError(dealId);
    const [row] = await tx.select().from(deals).where(eq(deals.id, dealId)).for("update");
    if (!row) throw new DealNotFoundError(dealId);
    return row;
  }

  return {
    lockRow,

    async createDeal(input: CreateDealInput): Promise<Deal> {
      const [row] = await db
        .insert(deals)
        .values({
          scenario: input.scenario ?? null,
          sellerName: input.seller.displayName,
          sellerEmail: input.seller.email,
          buyerName: input.buyer?.displayName ?? null,
          buyerEmail: input.buyer?.email ?? null,
        })
        .returning();
      return toDeal(row!);
    },

    async getDeal(dealId: string): Promise<Deal | null> {
      if (!isUuid(dealId)) return null;
      const [row] = await db.select().from(deals).where(eq(deals.id, dealId));
      return row ? toDeal(row) : null;
    },

    async setBuyer(dealId: string, buyer: Party): Promise<Deal> {
      if (!isUuid(dealId)) throw new DealNotFoundError(dealId);
      const [row] = await db
        .update(deals)
        .set({ buyerName: buyer.displayName, buyerEmail: buyer.email, updatedAt: new Date() })
        .where(eq(deals.id, dealId))
        .returning();
      if (!row) throw new DealNotFoundError(dealId);
      return toDeal(row);
    },

    async recordAgreement(dealId: string, role: "buyer" | "seller", at: string = new Date().toISOString()): Promise<Deal> {
      return db.transaction(async (tx) => {
        const row = await lockRow(tx, dealId);
        const deal = toDeal(row);
        assertAgreementAllowed(dealId, deal.state);
        const field = agreementField(role);
        if (deal[field] !== null) return deal;
        const when = new Date(at);
        const [updated] = await tx
          .update(deals)
          .set({ [field]: when, updatedAt: when })
          .where(eq(deals.id, dealId))
          .returning();
        const fresh = toDeal(updated!);
        await tx.insert(dealEvents).values({ id: uuidv7(), ...toEventRow(agreedEvent(fresh, role, fresh[field]!)) });
        return fresh;
      });
    },

    async transition(dealId: string, to: DealState, actor: DealEvent["actor"], summary: string): Promise<Deal> {
      return db.transaction(async (tx) => {
        const row = await lockRow(tx, dealId);
        const plan = planTransition(toDeal(row), to, actor, summary);
        const [updated] = await tx
          .update(deals)
          .set({ state: plan.to, updatedAt: new Date(plan.event.at) })
          .where(eq(deals.id, dealId))
          .returning();
        await tx.insert(dealEvents).values({ id: uuidv7(), ...toEventRow(plan.event) });
        return toDeal(updated!);
      });
    },
  };
}
