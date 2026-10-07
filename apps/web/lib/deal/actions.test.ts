import { describe, expect, it } from "vitest";
import { allowedActions, isWaitingOnOther } from "./actions";

const ids = (state: Parameters<typeof allowedActions>[0], role: Parameters<typeof allowedActions>[1]) => allowedActions(state, role).map((a) => a.id);

describe("allowedActions", () => {
  it("lets the buyer review a listed deal and either side cancel", () => {
    expect(ids("LISTED", "buyer")).toEqual(["review", "cancel"]);
    expect(ids("LISTED", "seller")).toEqual(["cancel"]);
  });

  it("lets the buyer agree after review, pay after agreeing", () => {
    expect(ids("REVIEWED", "buyer")).toEqual(["agree", "cancel"]);
    expect(ids("AGREED", "buyer")).toEqual(["pay", "cancel"]);
    expect(ids("AGREED", "seller")).toEqual(["cancel"]);
  });

  it("lets only the seller ship once paid; nobody can cancel, but the buyer can report an issue", () => {
    expect(ids("PAID", "seller")).toEqual(["ship"]);
    expect(ids("PAID", "buyer")).toEqual(["report_issue"]);
  });

  it("lets the buyer confirm delivery or report an issue, then complete or report an issue", () => {
    expect(ids("SHIPPED", "buyer")).toEqual(["confirm_delivery", "report_issue"]);
    expect(ids("SHIPPED", "seller")).toEqual([]);
    expect(ids("DELIVERED", "buyer")).toEqual(["complete", "report_issue"]);
    expect(ids("DELIVERED", "seller")).toEqual([]);
  });

  it("offers nothing in terminal states", () => {
    for (const state of ["COMPLETE", "BLOCKED", "ISSUE", "CANCELLED"] as const) {
      expect(ids(state, "buyer")).toEqual([]);
      expect(ids(state, "seller")).toEqual([]);
      expect(isWaitingOnOther(state, "buyer")).toBe(false);
    }
  });

  it("knows when a side is waiting on the other (an escape hatch like report_issue does not count)", () => {
    expect(isWaitingOnOther("PAID", "buyer")).toBe(true);
    expect(isWaitingOnOther("SHIPPED", "buyer")).toBe(false);
    expect(isWaitingOnOther("AGREED", "seller")).toBe(true);
    expect(isWaitingOnOther("AGREED", "buyer")).toBe(false);
  });
});
