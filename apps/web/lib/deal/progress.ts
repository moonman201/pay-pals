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

export type ProgressEnd =
  | { kind: "blocked"; label: "Blocked" }
  | { kind: "issue"; label: "Issue open" }
  | { kind: "cancelled"; label: "Cancelled" }
  /** The buyer is paying outside Goods and Services, so Pay Pals stepped back here. */
  | { kind: "off_platform"; label: "Paying another way" }
  | null;

export interface Progress {
  steps: { id: ProgressStepId; label: string; status: StepStatus }[];
  /**
   * Labels of the steps a deal that ended early will never reach, left out of
   * `steps` so the stepper does not list things that cannot happen. Empty for
   * a deal still moving and for one that ended after the last step.
   */
  notReached: string[];
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
  // Paying another way is the truer badge than the state it leaves behind: the deal did not
  // fail a check and nobody cancelled it, the buyer took the payment off Pay Pals. Nothing was
  // paid through Pay Pals either, so the steps themselves never advance past what happened.
  const offPlatform = events.some((e) => e.kind === "off_platform_chosen");
  const end: ProgressEnd = offPlatform
    ? { kind: "off_platform", label: "Paying another way" }
    : state === "BLOCKED"
      ? { kind: "blocked", label: "Blocked" }
      : state === "ISSUE"
        ? { kind: "issue", label: "Issue open" }
        : state === "CANCELLED"
          ? { kind: "cancelled", label: "Cancelled" }
          : null;
  const byState = DONE_BY_STATE[state];
  const doneCount = byState >= 0 ? byState : reachedFromEvents(events);
  // Off the happy path nothing is current: the end badge is what the reader needs next.
  const currentIndex = end ? -1 : doneCount;
  const all = PROGRESS_STEPS.map((id, i) => ({
    id,
    label: PROGRESS_LABELS[id],
    status: (i < doneCount ? "done" : i === currentIndex ? "current" : "upcoming") as StepStatus,
  }));
  // The end badge needs a step to sit after, so at least one stays.
  const keep = end ? Math.max(doneCount, 1) : all.length;
  return { steps: all.slice(0, keep), notReached: all.slice(keep).map((step) => step.label), end, complete: doneCount >= PROGRESS_STEPS.length };
}

/** The one-word names for the bar's segments: the same seven steps as the full stepper, short enough for a phone. */
export const SEGMENT_LABELS: Readonly<Record<ProgressStepId, string>> = {
  invited: "Invited",
  card: "Card",
  reviewed: "Reviewed",
  locked: "Agreed",
  paid: "Paid",
  shipped: "Shipped",
  arrived: "Arrived",
};

/**
 * Where the deal stands, in words, for the text beside the progress bar and for screen readers.
 * The last step reached, or how the deal ended and where: "Reviewed", "Stopped at Reviewed",
 * "Issue at Arrived", "Cancelled at Card". Colour alone never carries it.
 */
export function progressStatusText(progress: Progress): string {
  const done = progress.steps.filter((s) => s.status === "done");
  const last = done.length > 0 ? SEGMENT_LABELS[done[done.length - 1]!.id] : null;
  const at = (lead: string) => (last ? `${lead} at ${last}` : lead);
  switch (progress.end?.kind) {
    case "blocked":
      return at("Stopped");
    case "issue":
      return at("Issue");
    case "cancelled":
      return at("Cancelled");
    case "off_platform":
      return "Paying another way";
    default:
      return last ?? "Not started";
  }
}
