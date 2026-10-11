/**
 * Why a buyer opens an issue. Before delivery the item is missing or the
 * seller went quiet; after delivery it is what the arrival check found. The
 * API takes the reason enum; the step offers plain choices that map onto it
 * ("The box arrived empty" is an arrival mismatch with a detail line).
 */
import type { DealEvent, DealState } from "@pay-pals/contracts";

export const ISSUE_REASONS = ["not_arrived", "seller_unresponsive", "arrival_mismatch", "other"] as const;
export type IssueReason = (typeof ISSUE_REASONS)[number];

export const ISSUE_REASON_LABELS: Readonly<Record<IssueReason, string>> = {
  not_arrived: "The item never arrived",
  seller_unresponsive: "The seller stopped responding",
  arrival_mismatch: "What arrived does not match the locked card",
  other: "Something else",
};

/** Reasons that make sense from this state. */
export function issueReasonsFor(state: DealState): IssueReason[] {
  if (state === "DELIVERED") return ["arrival_mismatch", "other"];
  return ["not_arrived", "seller_unresponsive", "other"];
}

export interface IssueChoice {
  id: string;
  label: string;
  reason: IssueReason;
  /** Detail text sent with the reason when the choice is more specific than the enum. */
  details?: string;
}

/**
 * The moment a buyer opened an issue, and the reason they gave.
 *
 * The reason lives on the state change that opened the issue and nowhere
 * else: the chat message about it names the enum's label but not the words
 * the buyer picked, so "The box arrived empty" exists only here.
 *
 * A dispute reviewer reads the pack for the buyer's own account of what
 * went wrong, so the pack says it next to the arrival check rather than
 * leaving it at the bottom of a list of eighteen events. Same fact, read
 * from the same place as the room reads it.
 */
export function issueOpened(events: readonly DealEvent[]): { at: string; summary: string } | null {
  const opened = [...events].reverse().find((e) => e.kind === "state_changed" && e.toState === "ISSUE");
  const summary = opened?.summary?.trim();
  return opened && summary && carriesAReason(summary) ? { at: opened.at, summary } : null;
}

/**
 * Whether the summary says why, or only that.
 *
 * reportIssue writes "Issue opened: {reason}.{ details}". A deal seeded from
 * a fixture carries the bare "Issue opened." instead, and printing that under
 * a heading promising the buyer's own words would be a section that claims
 * more than it holds: nobody chose those words, the code wrote them.
 *
 * So the section appears only when a reason follows the lead-in. On a seeded
 * deal there is nothing to show and nothing is shown, which is the honest
 * answer until the fixture carries one.
 */
function carriesAReason(summary: string): boolean {
  return summary.replace(/^issue opened/i, "").replace(/[\s.:,;-]+/g, "") !== "";
}

/** What the issue step offers, in order, for this state. */
export function issueChoicesFor(state: DealState): IssueChoice[] {
  if (state === "DELIVERED") {
    return [
      { id: "arrival_mismatch", label: ISSUE_REASON_LABELS.arrival_mismatch, reason: "arrival_mismatch" },
      { id: "empty_box", label: "The box arrived empty", reason: "arrival_mismatch", details: "The box arrived empty." },
      { id: "other", label: ISSUE_REASON_LABELS.other, reason: "other" },
    ];
  }
  return issueReasonsFor(state).map((reason) => ({ id: reason, label: ISSUE_REASON_LABELS[reason], reason }));
}
