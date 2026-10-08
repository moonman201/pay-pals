/**
 * Item cards repository: one row per version, locked once at AGREED.
 * createdAt and lockedAt come from the store's clock.
 */
import { and, asc, eq } from "drizzle-orm";
import type { ItemCard } from "@pay-pals/contracts";
import { deals, itemCards } from "../../schema";
import { assertCardLockable, assertCardSavable } from "../card-rules";
import type { Clock } from "../clock";
import { CardLockedError, CardNotFoundError, CardVersionError } from "../errors";
import type { Db } from "./db";
import { toCard, toCardRow } from "./mappers";
import { isUuid } from "./uuid";

type LockRow = (tx: Db, dealId: string) => Promise<typeof deals.$inferSelect>;

export function cardsRepo(db: Db, lockDeal: LockRow, clock: Clock) {
  return {
    async saveCard(card: ItemCard): Promise<ItemCard> {
      return db.transaction(async (tx) => {
        const deal = await lockDeal(tx, card.dealId);
        if (deal.lockedCardVersion !== null) throw new CardLockedError(card.dealId, deal.lockedCardVersion);
        assertCardSavable(card.dealId, deal.state);
        const expected = deal.currentCardVersion + 1;
        if (card.version !== expected) throw new CardVersionError(card.dealId, expected, card.version);
        const now = clock();
        const [row] = await tx.insert(itemCards).values({ ...toCardRow(card), createdAt: now }).returning();
        // A changed card needs fresh agreement from both sides.
        await tx
          .update(deals)
          .set({ currentCardVersion: card.version, buyerAgreedAt: null, sellerAgreedAt: null, updatedAt: now })
          .where(eq(deals.id, card.dealId));
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
        assertCardLockable(dealId, deal.state);
        if (version !== deal.currentCardVersion) throw new CardVersionError(dealId, deal.currentCardVersion, version);
        if (row.lockedAt) return toCard(row);
        const now = clock();
        const [locked] = await tx.update(itemCards).set({ lockedAt: now }).where(eq(itemCards.id, row.id)).returning();
        await tx.update(deals).set({ lockedCardVersion: version, updatedAt: now }).where(eq(deals.id, dealId));
        return toCard(locked!);
      });
    },
  };
}
