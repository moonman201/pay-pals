/**
 * What the page knows about a review while it is still running.
 *
 * Two rules shape this file (Decisions 19 and 20).
 *
 * Order independence. The lookups run concurrently, so findings arrive in a
 * different order every run. Nothing here depends on arrival order: flags are
 * keyed by code, the view sorts by severity, and applying the same set of
 * events in any order gives the same state. A test shuffles them to prove it.
 *
 * A review in flight must never read as a clean result. An empty findings
 * area mid-review says the pal is still working, never that nothing is wrong.
 * That is the trap this feature creates, so the sentence is written here,
 * once, and tested, rather than left to whichever component renders it.
 */
import type { CertCheck, PriceCheck, RedFlag, ReviewProgress } from "@pay-pals/contracts";

export interface PhotoRead {
  url: string;
  readable: boolean;
}

export interface LiveReviewState {
  /** The review is running now. False before it starts and once it ends, either way. */
  running: boolean;
  /** The pal's own words for what it is doing, from the latest stage event. Null until one lands. */
  stage: string | null;
  /** Findings so far, newest last, one per flag code. */
  flags: RedFlag[];
  priceCheck: PriceCheck | null;
  priceChecked: boolean;
  certCheck: CertCheck | null;
  certChecked: boolean;
  photoReads: PhotoRead[];
  /** The review ended, whether it finished, failed or reported only some of its checks. Nothing is pending after this. */
  done: boolean;
  /** The review failed. The page says so rather than showing an empty result. */
  error: string | null;
}

export const IDLE_REVIEW: LiveReviewState = {
  running: false,
  stage: null,
  flags: [],
  priceCheck: null,
  priceChecked: false,
  certCheck: null,
  certChecked: false,
  photoReads: [],
  done: false,
  error: null,
};

export function startedReview(): LiveReviewState {
  return { ...IDLE_REVIEW, running: true };
}

/** The review ended. Whatever has not reported will not, so no line may still say it is running. */
export function finishReview(state: LiveReviewState): LiveReviewState {
  return { ...state, running: false, done: true };
}

/** What a lookup line says while it has not reported: running during a review, not checked once the review is over. */
export function pendingLine(state: LiveReviewState): string {
  return state.done ? "Not checked." : "Still running.";
}

const SEVERITY_ORDER: Record<RedFlag["severity"], number> = { stop: 0, caution: 1, info: 2 };

/** Loudest first, and stable within a severity, so the same findings always lay out the same way. */
export function orderedFlags(flags: readonly RedFlag[]): RedFlag[] {
  return [...flags].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.code.localeCompare(b.code));
}

/** One finding. Applying the same events in any order gives the same state. */
export function applyProgress(state: LiveReviewState, event: ReviewProgress): LiveReviewState {
  switch (event.kind) {
    case "stage":
      return { ...state, stage: event.stage };
    case "flag": {
      // Keyed by code: a rule and the model can both raise one, and it is still one finding.
      const without = state.flags.filter((f) => f.code !== event.flag.code);
      return { ...state, flags: [...without, event.flag] };
    }
    case "priceCheck":
      return { ...state, priceCheck: event.priceCheck, priceChecked: true };
    case "certCheck":
      return { ...state, certCheck: event.certCheck, certChecked: true };
    case "photoRead": {
      const without = state.photoReads.filter((p) => p.url !== event.url);
      return { ...state, photoReads: [...without, { url: event.url, readable: event.readable }] };
    }
    default:
      // A kind this page does not know yet is not a reason to lose the findings it already has.
      return state;
  }
}

export function hasStopFlag(state: LiveReviewState): boolean {
  return state.flags.some((f) => f.severity === "stop");
}

/** Nothing has come back yet. Not the same as nothing being wrong. */
export function nothingYet(state: LiveReviewState): boolean {
  return state.flags.length === 0 && !state.priceChecked && !state.certChecked && state.photoReads.length === 0;
}

/**
 * What the findings area says while the review runs. Never a verdict, never
 * a reassurance: it reports only that the pal is working and what has landed.
 */
export function liveReviewLine(state: LiveReviewState): string {
  if (state.error) return `The review did not finish: ${state.error} Nothing here is a verdict. Ask your pal to review again.`;
  if (!state.running) return "";
  if (nothingYet(state)) return "Your pal is still working. Nothing has come back yet, which is not the same as nothing being wrong.";
  if (hasStopFlag(state)) return "Your pal is still working and has already found something that stops this deal. More checks are still running.";
  return "Your pal is still working. What is below is what has come back so far, not the whole review.";
}

/** Why Agree is locked, said in the status line. Empty when it is not locked. */
export function agreeLockedLine(state: LiveReviewState): string {
  return state.running ? "Agree is locked until the review is complete, so nobody agrees on half the findings." : "";
}
