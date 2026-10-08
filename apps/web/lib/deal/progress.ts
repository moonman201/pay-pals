/**
 * The deal progress stepper, read from the deal state and the events.
 * Seven steps, one current; a deal that ended early (blocked, issue,
 * cancelled) keeps the steps it reached and adds an end badge.
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

/** Index of the step the state is working on; -1 for an end state, which reads the events instead. */
const CURRENT_BY_STATE: Readonly<Record<DealState, number>> = {
  DRAFT: 1,
  INVITED: 0,
  LISTED: 1,
  REVIEWED: 2,
  AGREED: 3,
  PAYMENT_PENDING: 4,
  PAID: 4,
  SHIPPED: 5,
  DELIVERED: 6,
  COMPLETE: 7,
  BLOCKED: -1,
  ISSUE: -1,
  CANCELLED: -1,
};

/** How far a deal got, from its events: the number of steps completed. */
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
  const byState = CURRENT_BY_STATE[state];
  // On the happy path the state names the current step and everything before it is done.
  // Off it, every step reached is done and nothing is current: the end badge is.
  const done = byState >= 0 ? byState : reachedFromEvents(events);
  // A deal that has moved to the next step has done the previous one; PAID means paid, so step "paid" is done and shipping is next.
  const doneCount = state === "PAID" ? 5 : state === "DELIVERED" ? 6 : done;
  const currentIndex = end ? -1 : doneCount;
  const steps = PROGRESS_STEPS.map((id, i) => ({
    id,
    label: PROGRESS_LABELS[id],
    status: (i < doneCount ? "done" : i === currentIndex ? "current" : "upcoming") as StepStatus,
  }));
  return { steps, end, complete: doneCount >= PROGRESS_STEPS.length };
}
