/**
 * Why a buyer opens an issue. Before delivery the item is missing or the
 * seller went quiet; after delivery it is what the arrival check found.
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
