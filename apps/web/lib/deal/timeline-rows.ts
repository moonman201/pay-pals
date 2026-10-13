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
import type { Actor, DealEvent, DealState } from "@pay-pals/contracts";
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
  /**
   * Who wrote the note: the actor on the folded state change, which is not
   * always the actor on the anchor. On the empty-box deal the Buyer Pal ran
   * the arrival check and the buyer opened the issue, so the note is the
   * buyer's. Null when there is no note.
   */
  noteActor: Actor | null;
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
 * Folds each state change into the action just before it.
 *
 * A second state change in a row folds into the same row: the review row
 * absorbs LISTED to REVIEWED, and on a blocked deal the REVIEWED to BLOCKED
 * that follows says nothing a separate row would add. `became` is the final
 * state and the hashes include every change.
 *
 * The exception is two changes that both carry a note. Each note is someone's
 * own words and a row holds one, so the second stays a row of its own rather
 * than lose either or hand one to the wrong author.
 */
export function timelineRows(events: readonly DealEvent[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  for (const event of events) {
    const previous = rows[rows.length - 1];
    if (event.kind === "state_changed" && previous && previous.event.kind !== "state_changed") {
      const note = stateChangeNote(event);
      if (previous.became === null || !(previous.note && note)) {
        previous.became = event.toState ?? null;
        if (note) {
          previous.note = note;
          previous.noteActor = event.actor;
        }
        previous.hashes.push(...shortHash(event));
        continue;
      }
    }
    rows.push({ event, became: null, note: null, noteActor: null, hashes: shortHash(event) });
  }
  return rows;
}
