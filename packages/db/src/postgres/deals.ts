/**
 * Deals repository: create, read, find, set buyer, seller join, agreement
 * and the state transition. Every write that adds a timeline event does it
 * in one transaction with the deal row locked, through insertEvent, so the
 * hash chain stays linear. Every timestamp comes from the store's clock,
 * never from the database default.
 */
import { and, asc, eq, inArray, isNull, type SQL } from "drizzle-orm";
import type { CreateDealInput, Deal, DealEvent, DealState, Party, ScenarioId } from "@pay-pals/contracts";
import { deals } from "../../schema";
import {
  agreedEvent,
  agreementField,
  assertAgreementAllowed,
  assertSellerMayJoin,
  mergeSeller,
  sellerJoinedEvent,
} from "../card-rules";
import type { Clock } from "../clock";
import { DealNotFoundError } from "../errors";
import { planTransition } from "../state-machine";
import type { Db } from "./db";
import { insertEvent } from "./events";
import { toDeal } from "./mappers";
import { isUuid } from "./uuid";

export function dealsRepo(db: Db, clock: Clock) {
  async function lockRow(tx: Db, dealId: string) {
    if (!isUuid(dealId)) throw new DealNotFoundError(dealId);
    const [row] = await tx.select().from(deals).where(eq(deals.id, dealId)).for("update");
    if (!row) throw new DealNotFoundError(dealId);
    return row;
  }

  return {
    lockRow,

    async createDeal(input: CreateDealInput): Promise<Deal> {
      const at = clock();
      const [row] = await db
        .insert(deals)
        .values({
          scenario: input.scenario ?? null,
          startedBy: input.startedBy,
          listingUrl: input.listingUrl ?? null,
          sellerName: input.seller.displayName,
          sellerEmail: input.seller.email,
          buyerName: input.buyer?.displayName ?? null,
          buyerEmail: input.buyer?.email ?? null,
          createdAt: at,
          updatedAt: at,
        })
        .returning();
      return toDeal(row!);
    },

    async getDeal(dealId: string): Promise<Deal | null> {
      if (!isUuid(dealId)) return null;
      const [row] = await db.select().from(deals).where(eq(deals.id, dealId));
      return row ? toDeal(row) : null;
    },

    async findDeals(query: { scenario?: ScenarioId | null; states?: readonly DealState[] }): Promise<Deal[]> {
      const where: SQL[] = [];
      if (query.scenario === null) where.push(isNull(deals.scenario));
      else if (query.scenario !== undefined) where.push(eq(deals.scenario, query.scenario));
      if (query.states !== undefined) {
        if (query.states.length === 0) return [];
        where.push(inArray(deals.state, [...query.states]));
      }
      const rows = await db
        .select()
        .from(deals)
        .where(where.length > 0 ? and(...where) : undefined)
        .orderBy(asc(deals.createdAt), asc(deals.id));
      return rows.map(toDeal);
    },

    async setBuyer(dealId: string, buyer: Party): Promise<Deal> {
      if (!isUuid(dealId)) throw new DealNotFoundError(dealId);
      const [row] = await db
        .update(deals)
        .set({ buyerName: buyer.displayName, buyerEmail: buyer.email, updatedAt: clock() })
        .where(eq(deals.id, dealId))
        .returning();
      if (!row) throw new DealNotFoundError(dealId);
      return toDeal(row);
    },

    async markSellerJoined(dealId: string, seller?: Partial<Party>): Promise<Deal> {
      return db.transaction(async (tx) => {
        const current = toDeal(await lockRow(tx, dealId));
        assertSellerMayJoin(dealId, current.state);
        if (current.sellerJoinedAt !== null) return current;
        const merged = mergeSeller(current.seller, seller);
        const when = clock();
        const [updated] = await tx
          .update(deals)
          .set({ sellerName: merged.displayName, sellerEmail: merged.email, sellerJoinedAt: when, updatedAt: when })
          .where(eq(deals.id, dealId))
          .returning();
        const fresh = toDeal(updated!);
        await insertEvent(tx, sellerJoinedEvent(fresh, fresh.sellerJoinedAt!));
        return fresh;
      });
    },

    async recordAgreement(dealId: string, role: "buyer" | "seller", at: string = clock().toISOString()): Promise<Deal> {
      return db.transaction(async (tx) => {
        const deal = toDeal(await lockRow(tx, dealId));
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
        await insertEvent(tx, agreedEvent(fresh, role, fresh[field]!));
        return fresh;
      });
    },

    async transition(dealId: string, to: DealState, actor: DealEvent["actor"], summary: string): Promise<Deal> {
      return db.transaction(async (tx) => {
        const row = await lockRow(tx, dealId);
        const plan = planTransition(toDeal(row), to, actor, summary, clock().toISOString());
        await insertEvent(tx, plan.event);
        const [updated] = await tx
          .update(deals)
          .set({ state: plan.to, updatedAt: new Date(plan.event.at) })
          .where(eq(deals.id, dealId))
          .returning();
        return toDeal(updated!);
      });
    },
  };
}
