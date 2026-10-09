/**
 * The deal progress stepper, read from the deal state and the events.
 * Seven steps. One rule holds everywhere: a step is done when the thing it
 * names has happened, and the current step is the next thing to do. A deal
 * that ended early (blocked, issue, cancelled) keeps the steps it reached
 * and adds an end badge instead of a current step.
 */
import type { DealEvent, DealState } from "@pay-pals/contracts";

export const PROGRESS_STEPS = ["invited", "card", "reviewed", "locked", "paid", "shipped", "arrived"] as const;
export type ProgressStepId = (typeof PROGRESS_STEPS)[number];

export const PROGRESS_LABELS: Readonly<Record<ProgressStepId, string>> = {
  invited: "Invited",
  card: "Card built",
  reviewed: "Reviewed",
  locked: "Agreed and locked",
  paid: "Paid",
  shipped: "Shipped",
  arrived: "Arrived",
};

export type StepStatus = "done" | "current" | "upcoming";

export type ProgressEnd = { kind: "blocked"; label: "Blocked" } | { kind: "issue"; label: "Issue open" } | { kind: "cancelled"; label: "Cancelled" } | null;

export interface Progress {
  steps: { id: ProgressStepId; label: string; status: StepStatus }[];
  /** Set when the deal ended off the happy path. The badge sits after the last step reached. */
  end: ProgressEnd;
  /** True once every step is done. */
  complete: boolean;
}

/**
 * How many steps the state says are finished. The invite is sent in
 * INVITED, the card exists in LISTED, the review is in at REVIEWED, the
 * card is locked at AGREED, and so on: the step the state names is done and
 * the next one is current. PAYMENT_PENDING is an order created but not
 * captured, so Paid is still the current step. An end state reads the
 * events instead.
 */
const DONE_BY_STATE: Readonly<Record<DealState, number>> = {
  DRAFT: 0,
  INVITED: 1,
  LISTED: 2,
  REVIEWED: 3,
  AGREED: 4,
  PAYMENT_PENDING: 4,
  PAID: 5,
  SHIPPED: 6,
  DELIVERED: 6,
  COMPLETE: 7,
  BLOCKED: -1,
  ISSUE: -1,
  CANCELLED: -1,
};

/** How far a deal that ended early got, from its events: the number of steps completed. */
function reachedFromEvents(events: readonly DealEvent[]): number {
  const kinds = new Set(events.map((e) => e.kind));
  if (kinds.has("arrival_checked")) return 7;
  if (kinds.has("delivered")) return 6;
  if (kinds.has("shipped")) return 6;
  if (kinds.has("payment_captured")) return 5;
  if (kinds.has("card_locked")) return 4;
  if (kinds.has("review_posted")) return 3;
  if (kinds.has("card_updated")) return 2;
  if (kinds.has("seller_invited")) return 1;
  return 0;
}

export function dealProgress(state: DealState, events: readonly DealEvent[]): Progress {
  const end: ProgressEnd = state === "BLOCKED" ? { kind: "blocked", label: "Blocked" } : state === "ISSUE" ? { kind: "issue", label: "Issue open" } : state === "CANCELLED" ? { kind: "cancelled", label: "Cancelled" } : null;
  const byState = DONE_BY_STATE[state];
  const doneCount = byState >= 0 ? byState : reachedFromEvents(events);
  // Off the happy path nothing is current: the end badge is what the reader needs next.
  const currentIndex = end ? -1 : doneCount;
  const steps = PROGRESS_STEPS.map((id, i) => ({
    id,
    label: PROGRESS_LABELS[id],
    status: (i < doneCount ? "done" : i === currentIndex ? "current" : "upcoming") as StepStatus,
  }));
  return { steps, end, complete: doneCount >= PROGRESS_STEPS.length };
}
