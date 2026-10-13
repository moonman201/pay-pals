/**
 * The moves a person can make from the action bar. Each one maps to a state
 * in DEAL_TRANSITIONS; whether it shows is decided by the contract's table,
 * never here. The only things this file adds are which side makes the move
 * and what the button says.
 */
import { canTransition, isTerminal, type Deal, type DealState } from "@pay-pals/contracts";
import type { Role } from "../role";

export type ActionId = "review" | "agree" | "pay" | "ship" | "confirm_delivery" | "complete" | "report_issue" | "cancel";

export interface DealAction {
  id: ActionId;
  label: string;
  /** Who makes this move. */
  role: Role | "either";
  /** The state the move leads to. */
  to: DealState;
}

export const DEAL_ACTIONS: readonly DealAction[] = [
  { id: "review", label: "Ask my pal to review", role: "buyer", to: "REVIEWED" },
  { id: "agree", label: "Agree", role: "either", to: "AGREED" },
  { id: "pay", label: "Pay", role: "buyer", to: "PAYMENT_PENDING" },
  { id: "ship", label: "Mark as shipped", role: "seller", to: "SHIPPED" },
  { id: "confirm_delivery", label: "Confirm delivery", role: "buyer", to: "DELIVERED" },
  { id: "complete", label: "Complete the deal", role: "buyer", to: "COMPLETE" },
  { id: "report_issue", label: "Report an issue", role: "buyer", to: "ISSUE" },
  { id: "cancel", label: "Cancel the deal", role: "either", to: "CANCELLED" },
];

/**
 * Actions the table allows from this state, for this side. Agree is a
 * REVIEWED move only: the table also allows PAYMENT_PENDING back to AGREED
 * (a cancelled payment), but that is not a button anyone presses.
 */
export function allowedActions(state: DealState, role: Role): DealAction[] {
  return DEAL_ACTIONS.filter((a) => {
    if (a.role !== role && a.role !== "either") return false;
    if (a.id === "agree") return state === "REVIEWED";
    // A blocked deal ends in a cancel, and only the buyer makes it: the seller has nothing to cancel, no order exists.
    if (a.id === "cancel" && state === "BLOCKED") return role === "buyer";
    return canTransition(state, a.to);
  });
}

/** Moves that end the deal rather than advance it. They do not count as "something to do". */
const ESCAPE_HATCHES: readonly ActionId[] = ["cancel", "report_issue"];

/** True when this side has nothing to do but wait (or bail out) and the deal is still moving. */
export function isWaitingOnOther(state: DealState, role: Role): boolean {
  if (isTerminal(state)) return false;
  return allowedActions(state, role).every((a) => ESCAPE_HATCHES.includes(a.id));
}

/** Paying keeps the deal in PAYMENT_PENDING while PayPal captures, so the pay step also shows there. */
export function canStillPay(state: DealState): boolean {
  return state === "AGREED" || state === "PAYMENT_PENDING";
}

export type Agreement = Pick<Deal, "buyerAgreedAt" | "sellerAgreedAt">;

export function hasAgreed(agreement: Agreement, role: Role): boolean {
  return role === "buyer" ? agreement.buyerAgreedAt !== null : agreement.sellerAgreedAt !== null;
}

/** The seller agrees to the card; the buyer's agree locks it when the seller already has. */
export function agreeLabel(role: Role, agreement: Agreement): string {
  if (role === "seller") return "Agree to this card";
  return agreement.sellerAgreedAt !== null ? "Agree and lock the card" : "Agree";
}
