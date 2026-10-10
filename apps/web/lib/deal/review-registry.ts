/**
 * The reviews running right now, one per deal.
 *
 * Two jobs, and they are the same fact seen from two sides (Decision 19):
 *
 *   1. The review must finish and save its verdict even if the browser that
 *      asked for it goes away. So the run is a promise of its own, started
 *      here and never tied to the lifetime of any stream watching it. A
 *      client disconnecting unsubscribes; it does not cancel anything.
 *   2. Agree stays locked until the review is complete, and that lock is
 *      enforced on the server. `isReviewing` is what the agree flow asks.
 *
 * Deliberately not a contract and not a column: "a review is running" is a
 * fact about this process, not about the deal. It is never inferred from the
 * absence of a verdict, because a deal in LISTED has no verdict and is not
 * mid-review.
 *
 * Scope, stated plainly because it matters: this is per server instance. Two
 * instances serving one deal would each know only their own runs, so an agree
 * landing on the other instance would not see the lock. A durable lock needs
 * an event kind or a column, which is a contract or schema change.
 */
import type { ReviewProgress, Verdict } from "@pay-pals/contracts";

export type ProgressListener = (event: ReviewProgress) => void;

export interface RunningReview {
  dealId: string;
  startedAt: number;
  /**
   * Resolves with the saved verdict. Detached from every stream: nothing a
   * client does can stop it, and its rejection is always handled here so a
   * review nobody is watching cannot take the process down.
   */
  done: Promise<Verdict>;
  /** Everything emitted so far, replayed to a listener that arrives late or reconnects. */
  seen: ReviewProgress[];
  listeners: Set<ProgressListener>;
}

type Registry = Map<string, RunningReview>;

const globalRef = globalThis as typeof globalThis & { __payPalsReviews?: Registry };

/** One registry per server process, on globalThis so a dev hot reload does not lose a running review. */
function registry(): Registry {
  globalRef.__payPalsReviews ??= new Map();
  return globalRef.__payPalsReviews;
}

export function isReviewing(dealId: string): boolean {
  return registry().has(dealId);
}

export function runningReview(dealId: string): RunningReview | null {
  return registry().get(dealId) ?? null;
}

/**
 * Start a review for this deal, or join the one already running.
 *
 * Joining rather than starting a second is what keeps the verdict saved
 * exactly once: a client that retries, reconnects or opens the room twice
 * gets the same run and the same single save.
 */
export function startOrJoinReview(dealId: string, run: (onProgress: ProgressListener) => Promise<Verdict>): RunningReview {
  const existing = registry().get(dealId);
  if (existing) return existing;

  const entry: RunningReview = { dealId, startedAt: Date.now(), seen: [], listeners: new Set(), done: undefined as unknown as Promise<Verdict> };
  const onProgress: ProgressListener = (event) => {
    entry.seen.push(event);
    for (const listener of entry.listeners) {
      // One listener throwing must not stop the others, and must not fail the review.
      try {
        listener(event);
      } catch {
        /* a stream that has gone away */
      }
    }
  };

  entry.done = run(onProgress).finally(() => {
    registry().delete(dealId);
    entry.listeners.clear();
  });
  // The run is the record, whether or not anyone is listening. Without this, a review whose
  // client left and which then failed would be an unhandled rejection.
  entry.done.catch(() => {});
  registry().set(dealId, entry);
  return entry;
}

/**
 * Watch a running review. Everything already emitted is replayed first, in
 * the order it landed, so a listener that arrives late sees the whole review.
 * Returns the unsubscribe.
 */
export function watchReview(review: RunningReview, listener: ProgressListener): () => void {
  for (const event of review.seen) listener(event);
  review.listeners.add(listener);
  return () => review.listeners.delete(listener);
}

/**
 * Why agree is refused while a review is running (Decision 19). A buyer must
 * never agree on partial findings, so this is enforced here and not only by
 * a disabled button.
 */
export const AGREE_WHILE_REVIEWING =
  "Your pal is still reviewing this deal. Agree opens when the review is complete, so nobody agrees on half the findings.";

/** Test seam: forget everything. Never called by the app. */
export function resetReviewRegistry(): void {
  registry().clear();
}
