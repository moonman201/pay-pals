/**
 * The moves a person can make from the action bar. Each one maps to a state
 * in DEAL_TRANSITIONS; whether it shows is decided by the contract's table,
 * never here. The only thing this file adds is which side makes the move.
 */
import { canTransition, isTerminal, type DealState } from "@pay-pals/contracts";
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
  { id: "agree", label: "Agree and lock the card", role: "buyer", to: "AGREED" },
  { id: "pay", label: "Pay", role: "buyer", to: "PAYMENT_PENDING" },
  { id: "ship", label: "Mark as shipped", role: "seller", to: "SHIPPED" },
  { id: "confirm_delivery", label: "Confirm delivery", role: "buyer", to: "DELIVERED" },
  { id: "complete", label: "Complete the deal", role: "buyer", to: "COMPLETE" },
  { id: "report_issue", label: "Report an issue", role: "buyer", to: "ISSUE" },
  { id: "cancel", label: "Cancel the deal", role: "either", to: "CANCELLED" },
];

/** Actions the table allows from this state, for this side. */
export function allowedActions(state: DealState, role: Role): DealAction[] {
  return DEAL_ACTIONS.filter((a) => (a.role === role || a.role === "either") && canTransition(state, a.to));
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
