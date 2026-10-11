/**
 * Reporting findings as they land, and the one rule that makes it safe to.
 *
 * A page watching a review must never be shown a finding the finished verdict
 * then contradicts. A flag that appears and is taken away is worse than a flag
 * that appears late, because the first one teaches the buyer not to trust the
 * panel (PLAN.md Decision 19).
 *
 * What makes early emission safe here is an invariant that already held before
 * any of this existed, in merge-flags.ts: every rule flag survives the merge
 * with its code intact, and a severity only ever goes up. The one thing that
 * can remove a flag is collapsePaymentFlags, and it removes only model-added
 * payment flags, because a rule-raised one always wins the pool. So a rule
 * flag emitted the moment the rules run is in the final verdict, always.
 *
 * Two things about such a flag can still change after it is sent: its wording,
 * which the model may put in plainer words, and its severity, which can rise.
 * Neither contradicts what was shown. The page still re-renders from the
 * finished verdict, because the contract says the verdict is the only
 * authority and progress is never the record.
 *
 * Model-added flags are reported too, but only after the merge and the
 * collapse, so what goes out is exactly what is in the verdict. Reporting one
 * earlier would risk sending a payment flag the collapse then folds away.
 */
import type { RedFlag, ReviewProgress } from "@pay-pals/contracts";

export type Emit = (event: ReviewProgress) => void;

/**
 * Wraps the caller's handler so a throw from it cannot fail the review: a page
 * that cannot receive progress still gets its verdict. Returns a handler that
 * does nothing when none was given, so callers need no null checks.
 */
export function emitter(onProgress?: (event: ReviewProgress) => void): Emit {
  if (!onProgress) return () => {};
  return (event) => {
    try {
      onProgress(event);
    } catch (error) {
      // The page's problem, not the review's.
      if (process.env.PAY_PALS_DEBUG) console.debug(`[pay-pals agents] onProgress threw: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}

/** Sends each flag once, by code, so the same finding is never reported twice. */
export function flagReporter(emit: Emit): (flags: readonly RedFlag[]) => void {
  const sent = new Set<RedFlag["code"]>();
  return (flags) => {
    for (const flag of flags) {
      if (sent.has(flag.code)) continue;
      sent.add(flag.code);
      emit({ kind: "flag", flag });
    }
  };
}
