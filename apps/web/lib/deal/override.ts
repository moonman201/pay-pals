/**
 * What a verdict means for the agree button. Decision 1 in PLAN.md: a buyer
 * can override caution flags, never a payment-method flag. The payment-method
 * list comes from the contract (PAYMENT_METHOD_FLAGS).
 */
import { isPaymentMethodFlag, type Verdict } from "@pay-pals/contracts";

export type Gate =
  /** Verdict is go. Agree without ceremony. */
  | "open"
  /** Flags were raised but none is about the payment method. The buyer may continue after saying they understand. */
  | "override"
  /** A payment-method flag. No override exists. */
  | "blocked";

export const BLOCKED_SENTENCE = "Pay Pals only moves money through a PayPal Goods and Services payment, so this deal cannot continue.";

export function gateFor(verdict: Verdict | null): Gate {
  if (!verdict) return "open";
  if (verdict.flags.some(isPaymentMethodFlag)) return "blocked";
  if (verdict.overall === "go") return "open";
  return "override";
}
