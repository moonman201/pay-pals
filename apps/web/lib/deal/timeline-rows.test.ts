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

  it("leaves a state change standing when two come in a row", () => {
    // Two in a row is not a tidy pair, and quietly folding the second would
    // hide a transition nobody can then account for.
    const rows = timelineRows([
      event({ id: "1", kind: "card_updated" }),
      event({ id: "2", kind: "state_changed", toState: "LISTED" }),
      event({ id: "3", kind: "state_changed", toState: "REVIEWED" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.became).toBe("LISTED");
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
});
