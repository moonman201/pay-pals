/**
 * Our record of the PayPal checkout order for a deal.
 */
import { z } from "zod";

export const PAYMENT_STATUSES = ["CREATED", "APPROVED", "CAPTURED", "FAILED", "DISPUTED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ["paypal", "venmo"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PaymentRecordSchema = z.object({
  dealId: z.string().min(1),
  paypalOrderId: z.string().min(1),
  captureId: z.string().nullable(),
  status: z.enum(PAYMENT_STATUSES),
  payeeEmail: z.string().email(),
  amount: z.number().positive(),
  currency: z.literal("USD"),
  method: z.enum(PAYMENT_METHODS).nullable(),
  createdAt: z.string().datetime(),
  capturedAt: z.string().datetime().nullable(),
});
export type PaymentRecord = z.infer<typeof PaymentRecordSchema>;
