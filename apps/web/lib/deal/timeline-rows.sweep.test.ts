/**
 * The sweep the coordinator asked for: every summary apps/web writes with a
 * state change, checked against the fold so nothing else vanished with the
 * issue reason.
 *
 * Kept in its own file because it is a census rather than a unit test. It
 * is the list that has to be revisited when a flow adds a transition, and
 * it fails loudly if one is added without a decision about its summary.
 */
import { emptyBox, type DealEvent, type DealState } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { stateChangeNote } from "./timeline-rows";

/** Built from a real stored event, so the shape cannot drift from the contract. */
const REAL = emptyBox.timeline.find((e) => e.kind === "state_changed")!;

function change(toState: DealState, summary: string): DealEvent {
  return { ...REAL, summary, toState };
}

/** Every `store.transition(...)` summary in apps/web/lib/deal/flows, by file. */
const WRITTEN: readonly { where: string; state: DealState; summary: string; kept: boolean }[] = [
  // Bare: the state's own name, so the row it folds into already says it.
  { where: "start.ts, invite.ts", state: "LISTED", summary: "Listed.", kept: false },
  { where: "start.ts, invite.ts", state: "INVITED", summary: "Waiting for the seller.", kept: false },
  { where: "review.ts", state: "REVIEWED", summary: "Reviewed.", kept: false },
  { where: "agree.ts", state: "AGREED", summary: "Agreed.", kept: false },
  { where: "pay.ts", state: "PAYMENT_PENDING", summary: "Payment pending.", kept: false },
  { where: "pay.ts", state: "PAID", summary: "Paid.", kept: false },
  { where: "ship.ts", state: "SHIPPED", summary: "Shipped.", kept: false },
  { where: "ship.ts", state: "DELIVERED", summary: "Delivered.", kept: false },
  { where: "close.ts", state: "COMPLETE", summary: "Complete.", kept: false },

  // Carrying the only copy of something. These are what the first fold lost.
  { where: "close.ts reportIssue", state: "ISSUE", summary: "Issue opened: what arrived does not match the locked card. The box arrived empty.", kept: true },
  { where: "close.ts cancelDeal", state: "CANCELLED", summary: "Cancelled by the buyer.", kept: true },
  { where: "close.ts cancelDeal", state: "CANCELLED", summary: "Cancelled by the seller.", kept: true },
  { where: "card.ts", state: "LISTED", summary: "Card changed. It needs a fresh review.", kept: true },
  { where: "off-platform.ts", state: "CANCELLED", summary: "The buyer is paying another way, so Pay Pals closed its part of the deal.", kept: true },
  { where: "review.ts", state: "BLOCKED", summary: "Pay Pals only moves money through a PayPal Goods and Services payment, so this deal cannot continue.", kept: true },
];

describe("the state-change sweep", () => {
  it("keeps every summary that says more than its own state, and drops every one that does not", () => {
    for (const row of WRITTEN) {
      const note = stateChangeNote(change(row.state, row.summary));
      expect(note === null, `${row.where}: "${row.summary}"`).toBe(!row.kept);
      if (row.kept) expect(note).toBe(row.summary);
    }
  });

  it("keeps the buyer's own words on the issue, which is the one this sweep exists for", () => {
    // "The box arrived empty" is a choice the buyer made and the only place it
    // ever lived was this summary. The empty-box deal is a dispute record; losing
    // the buyer's account of what went wrong is the worst thing it can lose.
    const note = stateChangeNote(change("ISSUE", "Issue opened: what arrived does not match the locked card. The box arrived empty."))!;
    expect(note).toContain("The box arrived empty.");
  });

  it("names which side cancelled, which the state alone does not", () => {
    expect(stateChangeNote(change("CANCELLED", "Cancelled by the seller."))).toContain("seller");
  });

  it("drops a bare summary whatever its punctuation or case", () => {
    for (const summary of ["Paid.", "paid", "PAID!", "  Paid  "]) {
      expect(stateChangeNote(change("PAID", summary)), summary).toBeNull();
    }
  });

  it("says nothing for a state change carrying no summary at all", () => {
    expect(stateChangeNote(change("PAID", ""))).toBeNull();
    expect(stateChangeNote(change("PAID", "   "))).toBeNull();
  });

  it("says nothing for an event with no destination state to compare against", () => {
    const { toState: _dropped, ...noDestination } = change("PAID", "Something happened.");
    expect(stateChangeNote(noDestination as DealEvent)).toBeNull();
  });
});
