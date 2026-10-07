/**
 * Webhook receipts repository: one row per PayPal event id handled.
 */
import { eq } from "drizzle-orm";
import { webhookReceipts } from "../../schema";
import type { Db } from "./db";

export function receiptsRepo(db: Db) {
  return {
    async hasWebhookReceipt(eventId: string): Promise<boolean> {
      const [row] = await db.select({ id: webhookReceipts.eventId }).from(webhookReceipts).where(eq(webhookReceipts.eventId, eventId));
      return Boolean(row);
    },

    async recordWebhookReceipt(eventId: string, eventType: string): Promise<boolean> {
      const inserted = await db
        .insert(webhookReceipts)
        .values({ eventId, eventType })
        .onConflictDoNothing({ target: webhookReceipts.eventId })
        .returning({ id: webhookReceipts.eventId });
      return inserted.length > 0;
    },
  };
}
