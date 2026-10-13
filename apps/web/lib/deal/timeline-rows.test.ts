import { cleanPs5, type DealEvent } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { timelineRows } from "./timeline-rows";

function event(overrides: Partial<DealEvent> & Pick<DealEvent, "id" | "kind">): DealEvent {
  return {
    dealId: "d1",
    actor: "buyer",
    summary: "Something happened.",
    at: "2026-10-11T00:00:00.000Z",
    hash: null,
    previousHash: null,
    fromState: null,
    toState: null,
    ...overrides,
  } as DealEvent;
}

describe("timelineRows", () => {
  it("folds a state change into the action just before it", () => {
    const rows = timelineRows([
      event({ id: "1", kind: "seller_joined", summary: "Matt M. joined the deal.", hash: "aaaaaaaabbbb" }),
      event({ id: "2", kind: "state_changed", fromState: "INVITED", toState: "LISTED", hash: "ccccccccdddd" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.event.id).toBe("1");
    expect(rows[0]!.became).toBe("LISTED");
  });

  it("keeps every fingerprint, because the chain is what they are for", () => {
    const rows = timelineRows([
      event({ id: "1", kind: "seller_joined", hash: "aaaaaaaabbbb" }),
      event({ id: "2", kind: "state_changed", toState: "LISTED", hash: "ccccccccdddd" }),
    ]);
    // Both, anchor first, short, in chain order.
    expect(rows[0]!.hashes).toEqual(["aaaaaaaa", "cccccccc"]);
  });

  it("folds a second state change in a row into the same row", () => {
    const rows = timelineRows([
      event({ id: "1", kind: "review_posted", actor: "buyer_pal", hash: "aaaaaaaa1111" }),
      event({ id: "2", kind: "state_changed", toState: "REVIEWED", summary: "Reviewed.", hash: "bbbbbbbb2222" }),
      event({ id: "3", kind: "state_changed", actor: "buyer_pal", toState: "BLOCKED", summary: "Blocked. No order was created.", hash: "cccccccc3333" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.became).toBe("BLOCKED");
    expect(rows[0]!.hashes).toEqual(["aaaaaaaa", "bbbbbbbb", "cccccccc"]);
    expect(rows[0]!.note).toBe("Blocked. No order was created.");
    expect(rows[0]!.noteActor).toBe("buyer_pal");
  });

  it("keeps an earlier note when a later bare change folds in", () => {
    const rows = timelineRows([
      event({ id: "1", kind: "card_updated" }),
      event({ id: "2", kind: "state_changed", actor: "buyer", toState: "CANCELLED", summary: "Cancelled by the buyer." }),
      event({ id: "3", kind: "state_changed", actor: "system", toState: "CANCELLED", summary: "Cancelled." }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.note).toBe("Cancelled by the buyer.");
    expect(rows[0]!.noteActor).toBe("buyer");
  });

  it("does not fold two changes that both carry a note, so neither is lost or misattributed", () => {
    const rows = timelineRows([
      event({ id: "1", kind: "card_updated" }),
      event({ id: "2", kind: "state_changed", actor: "buyer", toState: "CANCELLED", summary: "Cancelled by the buyer." }),
      event({ id: "3", kind: "state_changed", actor: "seller", toState: "ISSUE", summary: "Issue opened: the box arrived empty." }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.noteActor).toBe("buyer");
    expect(rows[1]!.event.id).toBe("3");
  });

  it("leaves a state change standing when it opens the list", () => {
    const rows = timelineRows([event({ id: "1", kind: "state_changed", toState: "DRAFT" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.event.kind).toBe("state_changed");
  });

  it("folds only one state change per action, never two", () => {
    const rows = timelineRows([
      event({ id: "1", kind: "agreed" }),
      event({ id: "2", kind: "state_changed", toState: "AGREED" }),
      event({ id: "3", kind: "payment_captured" }),
      event({ id: "4", kind: "state_changed", toState: "PAID" }),
    ]);
    expect(rows.map((r) => [r.event.id, r.became])).toEqual([
      ["1", "AGREED"],
      ["3", "PAID"],
    ]);
  });

  it("shortens the real clean deal and loses no event on the way", () => {
    const rows = timelineRows(cleanPs5.timeline);
    expect(rows.length).toBeLessThan(cleanPs5.timeline.length);
    // Every event is still represented: one row each, or folded into one.
    const folded = rows.reduce((n, r) => n + (r.became === null ? 1 : 2), 0);
    expect(folded).toBe(cleanPs5.timeline.length);
    // And every hash the timeline carried is still printed somewhere.
    const shown = new Set(rows.flatMap((r) => r.hashes));
    for (const e of cleanPs5.timeline) if (e.hash) expect(shown.has(e.hash.slice(0, 8)), e.id).toBe(true);
  });

  it("has nothing to do with an empty timeline", () => {
    expect(timelineRows([])).toEqual([]);
  });

  it("attributes a folded note to the actor who wrote it, not the row's actor", () => {
    const rows = timelineRows([
      event({ id: "1", kind: "arrival_checked", actor: "buyer_pal", summary: "Arrival does not match." }),
      event({ id: "2", kind: "state_changed", actor: "buyer", toState: "ISSUE", summary: "Issue opened: the box arrived empty." }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.event.actor).toBe("buyer_pal");
    expect(rows[0]!.note).toBe("Issue opened: the box arrived empty.");
    expect(rows[0]!.noteActor).toBe("buyer");
  });

  it("has no note actor when there is no note", () => {
    const rows = timelineRows([
      event({ id: "1", kind: "agreed", actor: "buyer" }),
      event({ id: "2", kind: "state_changed", actor: "system", toState: "AGREED", summary: "Agreed." }),
    ]);
    expect(rows[0]!.note).toBeNull();
    expect(rows[0]!.noteActor).toBeNull();
  });
});
