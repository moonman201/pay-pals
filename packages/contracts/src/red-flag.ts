/**
 * Red flags the Buyer Pal raises. Codes are fixed; the explanation is written
 * for the buyer in one plain sentence.
 */
import { z } from "zod";

export const RED_FLAG_CODES = [
  "FRIENDS_AND_FAMILY_REQUEST",
  "OFF_PLATFORM_PAYMENT",
  "PRICE_FAR_BELOW_MARKET",
  "URGENCY_PRESSURE",
  "NAME_MISMATCH",
  "STOCK_OR_REUSED_PHOTO",
  "MISSING_SERIAL",
  "SHIP_BEFORE_PAY_TRICK",
  "OTHER",
] as const;
export type RedFlagCode = (typeof RED_FLAG_CODES)[number];

export const RED_FLAG_SEVERITIES = ["info", "caution", "stop"] as const;
export type RedFlagSeverity = (typeof RED_FLAG_SEVERITIES)[number];

/**
 * Flags tied to the payment method. A buyer can never override these, because
 * Pay Pals only ever creates a Goods and Services checkout payment.
 */
export const PAYMENT_METHOD_FLAGS: readonly RedFlagCode[] = [
  "FRIENDS_AND_FAMILY_REQUEST",
  "OFF_PLATFORM_PAYMENT",
];

export const RedFlagSchema = z.object({
  code: z.enum(RED_FLAG_CODES),
  severity: z.enum(RED_FLAG_SEVERITIES),
  /** A quote from the chat or the field name and value that triggered it. */
  evidence: z.string().min(1).max(500),
  /** One plain sentence for the buyer. */
  explanation: z.string().min(1).max(300),
  /** True when a deterministic rule raised it. The model may add flags but never drop these. */
  raisedByRule: z.boolean(),
});
export type RedFlag = z.infer<typeof RedFlagSchema>;

export function isPaymentMethodFlag(flag: RedFlag): boolean {
  return PAYMENT_METHOD_FLAGS.includes(flag.code);
}

export function hasStop(flags: readonly RedFlag[]): boolean {
  return flags.some((f) => f.severity === "stop");
}
