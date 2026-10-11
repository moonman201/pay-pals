/**
 * The timeline, with state changes folded into the event that caused them.
 *
 * Every action writes two events: the thing that happened, and the state
 * change behind it. On the clean deal that doubled the list, and the second
 * of each pair said nothing the first had not. They are one row now, with
 * the new state on the end of the line.
 *
 * Nothing is dropped. A folded event keeps its fingerprint on the row, so
 * the chain a reader can check is still all there and still in order; that
 * is the point of showing fingerprints at all.
 */
import type { DealEvent, DealState } from "@pay-pals/contracts";

export interface TimelineRow {
  /** The event the row is about. */
  event: DealEvent;
  /** The state this action moved the deal to, when it moved it. */
  became: DealState | null;
  /** Every fingerprint folded into this row, the anchor's first. Short, in chain order. */
  hashes: string[];
}

function shortHash(event: DealEvent): string[] {
  return event.hash ? [event.hash.slice(0, 8)] : [];
}

/**
 * Folds each state change into the event just before it.
 *
 * Only the event immediately before, and only when that event is not itself
 * a state change: two state changes in a row mean something happened that
 * this view should not quietly tidy away, so the second stays a row of its
 * own where it can be seen.
 */
export function timelineRows(events: readonly DealEvent[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  for (const event of events) {
    const previous = rows[rows.length - 1];
    if (event.kind === "state_changed" && previous && previous.event.kind !== "state_changed" && previous.became === null) {
      previous.became = event.toState ?? null;
      previous.hashes.push(...shortHash(event));
      continue;
    }
    rows.push({ event, became: null, hashes: shortHash(event) });
  }
  return rows;
}
