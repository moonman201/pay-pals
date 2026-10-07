/**
 * Payments repository: one row per PayPal order, upserted by order id as the
 * capture and webhook handlers update status.
 */
import { desc, eq } from "drizzle-orm";
import type { PaymentRecord } from "@pay-pals/contracts";
import { payments } from "../../schema";
import { DealNotFoundError } from "../errors";
import type { Db } from "./db";
import { toPayment, toPaymentRow } from "./mappers";
import { isUuid } from "./uuid";

export function paymentsRepo(db: Db) {
  return {
    async savePayment(payment: PaymentRecord): Promise<PaymentRecord> {
      if (!isUuid(payment.dealId)) throw new DealNotFoundError(payment.dealId);
      const row = toPaymentRow(payment);
      const [saved] = await db
        .insert(payments)
        .values(row)
        .onConflictDoUpdate({
          target: payments.paypalOrderId,
          set: {
            status: row.status,
            captureId: row.captureId,
            capturedAt: row.capturedAt,
            method: row.method,
            payeeEmail: row.payeeEmail,
            amountCents: row.amountCents,
            updatedAt: new Date(),
          },
        })
        .returning();
      return toPayment(saved!);
    },

    async getPayment(dealId: string): Promise<PaymentRecord | null> {
      if (!isUuid(dealId)) return null;
      const [row] = await db.select().from(payments).where(eq(payments.dealId, dealId)).orderBy(desc(payments.createdAt)).limit(1);
      return row ? toPayment(row) : null;
    },

    async getPaymentByOrderId(paypalOrderId: string): Promise<PaymentRecord | null> {
      const [row] = await db.select().from(payments).where(eq(payments.paypalOrderId, paypalOrderId)).limit(1);
      return row ? toPayment(row) : null;
    },
  };
}
