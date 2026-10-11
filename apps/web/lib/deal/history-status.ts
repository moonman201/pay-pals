/**
 * The hash chain badge, computed on render from the stored events and the
 * hash recorded on the PayPal order. Pure: contracts' verifyChain and
 * historyMatchesHead do the work.
 */
import { historyMatchesHead, verifyChain, type DealEvent } from "@pay-pals/contracts";

export type HistoryStatus =
  /** No order yet. The chain is intact as stored. */
  | { kind: "unanchored"; events: number; chainOk: boolean }
  /** The stored events reproduce the hash PayPal holds. */
  | { kind: "verified"; events: number }
  /** The stored events do not reproduce the hash PayPal holds, or the chain itself is broken. */
  | { kind: "mismatch"; events: number; brokenAt: number | null };

export function historyStatus(events: readonly DealEvent[], historyHash: string | null | undefined): HistoryStatus {
  const chain = verifyChain(events);
  if (!historyHash) return { kind: "unanchored", events: events.length, chainOk: chain.ok };
  if (chain.ok && historyMatchesHead(events, historyHash)) return { kind: "verified", events: events.length };
  return { kind: "mismatch", events: events.length, brokenAt: chain.brokenAt };
}

/**
 * Plain words, not engineer words (Matt's rule 6). "Hash-chained" is what
 * it is; "tamper-evident" is what it does, and a judge reading the header
 * should not have to know the first to understand the second. The hash
 * itself is still on the page, in the timeline, where it can be checked.
 */
export function historyLine(status: HistoryStatus): string {
  switch (status.kind) {
    case "verified":
      return "History unchanged since PayPal order";
    case "mismatch":
      return "History does not match the hash on the PayPal order";
    case "unanchored":
      return status.chainOk ? `Tamper-evident history, ${status.events} ${status.events === 1 ? "event" : "events"}` : "History chain is broken";
  }
}
