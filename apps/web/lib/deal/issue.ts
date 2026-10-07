/**
 * Why a buyer opens an issue. Before delivery the item is missing or the
 * seller went quiet; after delivery it is what the arrival check found. The
 * API takes the reason enum; the step offers plain choices that map onto it
 * ("The box arrived empty" is an arrival mismatch with a detail line).
 */
import type { DealState } from "@pay-pals/contracts";

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
