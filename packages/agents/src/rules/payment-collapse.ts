/**
 * One payment flag per review. A seller who refuses the invite, wants Friends
 * and Family and mentions Zelle has made one demand, not three, so the three
 * payment codes collapse into the most serious: INVITE_REFUSED over
 * FRIENDS_AND_FAMILY_REQUEST over OFF_PLATFORM_PAYMENT. The kept flag quotes
 * the seller once and its explanation covers every method that was asked for.
 * A rule-raised payment flag outranks a model-added one, whatever the code,
 * so the deterministic finding is what the verdict shows.
 */
import type { RedFlag, RedFlagCode } from "@pay-pals/contracts";

export const PAYMENT_FLAG_ORDER: readonly RedFlagCode[] = ["INVITE_REFUSED", "FRIENDS_AND_FAMILY_REQUEST", "OFF_PLATFORM_PAYMENT"];

function demandWords(codes: Set<RedFlagCode>): string {
  // Short enough to sit in a reason line of about twelve words.
  const parts = [
    codes.has("FRIENDS_AND_FAMILY_REQUEST") ? "Friends and Family" : null,
    codes.has("OFF_PLATFORM_PAYMENT") ? "payment outside PayPal" : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(" or ") : "an unprotected payment";
}

export function collapsePaymentFlags(flags: readonly RedFlag[]): RedFlag[] {
  const payment = flags.filter((f) => PAYMENT_FLAG_ORDER.includes(f.code));
  if (payment.length <= 1) return [...flags];

  const pool = payment.some((f) => f.raisedByRule) ? payment.filter((f) => f.raisedByRule) : payment;
  const kept = [...pool].sort((a, b) => PAYMENT_FLAG_ORDER.indexOf(a.code) - PAYMENT_FLAG_ORDER.indexOf(b.code))[0]!;
  const codes = new Set(payment.map((f) => f.code));
  const demand = demandWords(codes);
  const explanation =
    kept.code === "INVITE_REFUSED"
      ? `Refused Pay Pals protection and wants ${demand}.`
      : `Wants ${demand}. That has no buyer protection.`;
  const merged: RedFlag = { ...kept, severity: "stop", explanation: explanation.slice(0, 300) };

  return flags.filter((f) => f === kept || !PAYMENT_FLAG_ORDER.includes(f.code)).map((f) => (f === kept ? merged : f));
}
