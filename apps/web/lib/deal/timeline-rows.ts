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
import { STATE_LABELS } from "../labels";

export interface TimelineRow {
  /** The event the row is about. */
  event: DealEvent;
  /** The state this action moved the deal to, when it moved it. */
  became: DealState | null;
  /**
   * What the folded state change said, when it said more than its own state
   * name. Null for the bare ones, which is most of them.
   */
  note: string | null;
  /** Every fingerprint folded into this row, the anchor's first. Short, in chain order. */
  hashes: string[];
}

function shortHash(event: DealEvent): string[] {
  return event.hash ? [event.hash.slice(0, 8)] : [];
}

function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Whether a state change's summary carries anything its own state label does
 * not already say.
 *
 * Most are the state's name with a full stop: "Paid.", "Listed.",
 * "Delivered.". Folding those away loses nothing, because the row they fold
 * into says what happened and the state is on the end of it.
 *
 * A few carry the only copy of something: the reason a buyer opened an issue
 * and the words they chose, which side cancelled, why a card needs another
 * look. The first version of this fold dropped all of them, which took the
 * buyer's own account of what went wrong off the empty-box deal, the one
 * deal whose whole purpose is a record of that. qa caught it because it
 * happened to have an assertion on it.
 *
 * The test is containment, not equality: "Agreed." sits inside "Agreed, card
 * locked" and adds nothing, while "Cancelled by the buyer." does not sit
 * inside "Cancelled" and names who did it.
 */
export function stateChangeNote(event: DealEvent): string | null {
  const summary = event.summary?.trim() ?? "";
  if (summary === "" || !event.toState) return null;
  const said = norm(summary);
  return said === "" || norm(STATE_LABELS[event.toState]).includes(said) ? null : summary;
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
      previous.note = stateChangeNote(event);
      previous.hashes.push(...shortHash(event));
      continue;
    }
    rows.push({ event, became: null, note: null, hashes: shortHash(event) });
  }
  return rows;
}
