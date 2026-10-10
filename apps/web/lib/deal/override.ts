/**
 * What a verdict means for the buyer's agree button. PLAN.md Decisions 1
 * and 6: a buyer can override caution flags and non-payment stops, each
 * with an explicit acknowledgment, but never a payment-method flag. The
 * payment-method list comes from the contract (PAYMENT_METHOD_FLAGS).
 */
import { isPaymentMethodFlag, type RedFlag, type RedFlagCode, type Verdict } from "@pay-pals/contracts";

export type Gate =
  /** Verdict is go. Agree without ceremony. */
  | "open"
  /** Caution flags only. The buyer may continue after saying they understand. */
  | "override"
  /** A stop that is not about the payment method. Sterner warning, same checkbox. */
  | "stop_override"
  /** A payment-method flag. No override exists. */
  | "blocked";

export const BLOCKED_SENTENCE = "Pay Pals only moves money through a PayPal Goods and Services payment, so this deal cannot continue.";

export const CAUTION_CHECKBOX = "I understand, continue anyway. My pal raised flags and I have read them.";
export const STOP_CHECKBOX = "I read the warning and I still want to continue.";

const FLAG_WORDS: Readonly<Record<RedFlagCode, string>> = {
  FRIENDS_AND_FAMILY_REQUEST: "a Friends and Family request",
  OFF_PLATFORM_PAYMENT: "payment outside PayPal",
  PRICE_FAR_BELOW_MARKET: "a price far below market",
  URGENCY_PRESSURE: "pressure to pay now",
  NAME_MISMATCH: "a PayPal account that does not match the seller",
  STOCK_OR_REUSED_PHOTO: "a catalog photo instead of the real item",
  MISSING_SERIAL: "no serial number",
  SHIP_BEFORE_PAY_TRICK: "a trick to get money before shipping",
  INVITE_REFUSED: "the seller refused Pay Pals protection",
  CERT_MISMATCH: "a grading cert that does not match PSA's record",
  MISSING_PACKING_PHOTO: "a packing photo the seller skipped",
  OTHER: "another concern",
};

export { FLAG_WORDS };

export function stopFlags(verdict: Verdict): RedFlag[] {
  return verdict.flags.filter((f) => f.severity === "stop" && !isPaymentMethodFlag(f));
}

export function gateFor(verdict: Verdict | null): Gate {
  if (!verdict) return "open";
  if (verdict.flags.some(isPaymentMethodFlag)) return "blocked";
  if (stopFlags(verdict).length > 0) return "stop_override";
  if (verdict.overall === "go") return "open";
  return "override";
}

/**
 * Three short sentences for a non-payment stop. Names the flags, says what
 * they are, says what protection covers.
 *
 * The middle sentence used to tell the buyer what the seller was going to
 * do with their money, which states as fact something Pay Pals inferred, on
 * a stop the buyer is allowed to override. It names the flags as a risk
 * signal instead, and says what to do about it, matching the wording the
 * Buyer Pal's own price rule uses. Guarded in lib/copy-rules.test.ts.
 */
export function stopWarning(verdict: Verdict): string[] {
  const names = stopFlags(verdict).map((f) => FLAG_WORDS[f.code]);
  const list = names.length <= 1 ? (names[0] ?? "a stop") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const these = names.length <= 1 ? "That is a risk signal" : "Those are risk signals";
  return [
    `Your pal says stop. It found ${list}.`,
    `${these}, so ask the seller about it before you pay.`,
    "PayPal Goods and Services protection covers an item that never arrives or is not as described, nothing more, so paying against a stop is a risk you carry yourself.",
  ];
}
