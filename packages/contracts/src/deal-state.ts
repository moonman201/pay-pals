/**
 * Deal states and the table of legal transitions.
 *
 * This file is the single source of truth for which moves a deal may make.
 * packages/db enforces it against stored deals; apps/web reads it to decide
 * which buttons to show. Nothing else should hard-code a state name.
 */

export const DEAL_STATES = [
  "DRAFT",
  "LISTED",
  "REVIEWED",
  "AGREED",
  "PAYMENT_PENDING",
  "PAID",
  "SHIPPED",
  "DELIVERED",
  "COMPLETE",
  "BLOCKED",
  "ISSUE",
  "CANCELLED",
] as const;

export type DealState = (typeof DEAL_STATES)[number];

/** Legal next states for each state. Terminal states have an empty list. */
export const DEAL_TRANSITIONS: Readonly<Record<DealState, readonly DealState[]>> = {
  DRAFT: ["LISTED", "CANCELLED"],
  LISTED: ["REVIEWED", "CANCELLED"],
  REVIEWED: ["AGREED", "BLOCKED", "LISTED", "CANCELLED"],
  AGREED: ["PAYMENT_PENDING", "CANCELLED"],
  PAYMENT_PENDING: ["PAID", "AGREED", "CANCELLED"],
  PAID: ["SHIPPED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["COMPLETE", "ISSUE"],
  COMPLETE: [],
  BLOCKED: [],
  ISSUE: [],
  CANCELLED: [],
};

export const TERMINAL_STATES: readonly DealState[] = ["COMPLETE", "BLOCKED", "ISSUE", "CANCELLED"];

/** States in which the item card may still change. From AGREED on it is locked. */
export const CARD_EDITABLE_STATES: readonly DealState[] = ["DRAFT", "LISTED", "REVIEWED"];

/** States at or after which money has moved. Cancelling is no longer allowed. */
export const MONEY_MOVED_STATES: readonly DealState[] = ["PAID", "SHIPPED", "DELIVERED", "COMPLETE", "ISSUE"];

export function canTransition(from: DealState, to: DealState): boolean {
  return DEAL_TRANSITIONS[from].includes(to);
}

export function isTerminal(state: DealState): boolean {
  return TERMINAL_STATES.includes(state);
}

export function isCardEditable(state: DealState): boolean {
  return CARD_EDITABLE_STATES.includes(state);
}

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: DealState,
    public readonly to: DealState,
  ) {
    super(`Illegal deal transition: ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

/** Throws IllegalTransitionError when the move is not in the table. */
export function assertTransition(from: DealState, to: DealState): void {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
}
