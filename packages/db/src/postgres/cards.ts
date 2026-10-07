/**
 * Item cards repository: one row per version, locked once at AGREED.
 */
import { and, asc, eq } from "drizzle-orm";
import type { ItemCard } from "@pay-pals/contracts";
import { deals, itemCards } from "../../schema";
import { CardLockedError, CardNotFoundError, CardVersionError } from "../errors";
import type { Db } from "./db";
import { toCard, toCardRow } from "./mappers";
import { isUuid } from "./uuid";

type LockRow = (tx: Db, dealId: string) => Promise<typeof deals.$inferSelect>;

export function cardsRepo(db: Db, lockDeal: LockRow) {
  return {
    async saveCard(card: ItemCard): Promise<ItemCard> {
      return db.transaction(async (tx) => {
        const deal = await lockDeal(tx, card.dealId);
        if (deal.lockedCardVersion !== null) throw new CardLockedError(card.dealId, deal.lockedCardVersion);
        const expected = deal.currentCardVersion + 1;
        if (card.version !== expected) throw new CardVersionError(card.dealId, expected, card.version);
        const [row] = await tx.insert(itemCards).values(toCardRow(card)).returning();
        await tx.update(deals).set({ currentCardVersion: card.version, updatedAt: new Date() }).where(eq(deals.id, card.dealId));
        return toCard(row!);
      });
    },

    async getCard(dealId: string, version: number): Promise<ItemCard | null> {
      if (!isUuid(dealId)) return null;
      const [row] = await db
        .select()
        .from(itemCards)
        .where(and(eq(itemCards.dealId, dealId), eq(itemCards.version, version)));
      return row ? toCard(row) : null;
    },

    async getCurrentCard(dealId: string): Promise<ItemCard | null> {
      if (!isUuid(dealId)) return null;
      const [deal] = await db.select({ v: deals.currentCardVersion }).from(deals).where(eq(deals.id, dealId));
      if (!deal || deal.v === 0) return null;
      const [row] = await db
        .select()
        .from(itemCards)
        .where(and(eq(itemCards.dealId, dealId), eq(itemCards.version, deal.v)));
      return row ? toCard(row) : null;
    },

    async listCards(dealId: string): Promise<ItemCard[]> {
      if (!isUuid(dealId)) return [];
      const rows = await db.select().from(itemCards).where(eq(itemCards.dealId, dealId)).orderBy(asc(itemCards.version));
      return rows.map(toCard);
    },

    async lockCard(dealId: string, version: number): Promise<ItemCard> {
      return db.transaction(async (tx) => {
        const deal = await lockDeal(tx, dealId);
        const [row] = await tx
          .select()
          .from(itemCards)
          .where(and(eq(itemCards.dealId, dealId), eq(itemCards.version, version)));
        if (!row) throw new CardNotFoundError(dealId, version);
        if (deal.lockedCardVersion !== null && deal.lockedCardVersion !== version) {
          throw new CardLockedError(dealId, deal.lockedCardVersion);
        }
        if (version !== deal.currentCardVersion) throw new CardVersionError(dealId, deal.currentCardVersion, version);
        if (row.lockedAt) return toCard(row);
        const now = new Date();
        const [locked] = await tx.update(itemCards).set({ lockedAt: now }).where(eq(itemCards.id, row.id)).returning();
        await tx.update(deals).set({ lockedCardVersion: version, updatedAt: now }).where(eq(deals.id, dealId));
        return toCard(locked!);
      });
    },
  };
}
