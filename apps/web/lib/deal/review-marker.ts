/**
 * A note the browser keeps that "I asked for a review of this deal", so a
 * reopened page can show the review as running even when the server instance
 * that answers the reopen is not the one running it. The server's own record
 * (the in-process registry, `snapshot.reviewInFlight`) wins whenever it knows.
 *
 * A convenience, never the record: the verdict is saved on the server. The
 * note expires, so a review that failed cannot lock the button for good.
 * Pure over an injected storage, so it tests without a browser.
 */
export const REVIEW_MARKER_TTL_MS = 150_000;

export interface MarkerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const keyFor = (dealId: string) => `pay-pals:review-started:${dealId}`;

function safely<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function markReviewStarted(storage: MarkerStorage | null, dealId: string, now: number): void {
  if (storage) safely(() => storage.setItem(keyFor(dealId), String(now)), undefined);
}

export function clearReviewMarker(storage: MarkerStorage | null, dealId: string): void {
  if (storage) safely(() => storage.removeItem(keyFor(dealId)), undefined);
}

/** Milliseconds this deal's review note has left, or 0 when there is none or it has run out. */
export function reviewMarkerLeft(storage: MarkerStorage | null, dealId: string, now: number): number {
  if (!storage) return 0;
  const raw = safely(() => storage.getItem(keyFor(dealId)), null);
  const at = raw === null ? NaN : Number(raw);
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, at + REVIEW_MARKER_TTL_MS - now);
}
