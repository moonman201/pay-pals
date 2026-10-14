import type { DealEvent, DealEventKind } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { progressStatusText, SEGMENT_LABELS, dealProgress, PROGRESS_STEPS } from "./progress";

const ev = (kind: DealEventKind): DealEvent =>
  ({ id: kind, dealId: "d", kind, actor: "system", summary: kind, at: "2026-10-01T00:00:00.000Z", prevHash: null, hash: "0".repeat(64) }) as DealEvent;

const statuses = (state: Parameters<typeof dealProgress>[0], events: DealEvent[] = []) => dealProgress(state, events).steps.map((s) => s.status);
const D = "done";
const C = "current";
const U = "upcoming";

describe("dealProgress", () => {
  it("names the seven steps in order", () => {
    expect(dealProgress("INVITED", []).steps.map((s) => s.label)).toEqual(["Invited", "Card built", "Reviewed", "Agreed and locked", "Paid", "Shipped", "Arrived"]);
    expect(PROGRESS_STEPS).toHaveLength(7);
  });

  it("ticks the step the state names and makes the next thing to do current", () => {
    // One rule from end to end: the invite is out, so Invited is done and the card is next.
    expect(statuses("INVITED")).toEqual([D, C, U, U, U, U, U]);
    expect(statuses("LISTED")).toEqual([D, D, C, U, U, U, U]);
    expect(statuses("REVIEWED")).toEqual([D, D, D, C, U, U, U]);
    expect(statuses("AGREED")).toEqual([D, D, D, D, C, U, U]);
    expect(statuses("PAID")).toEqual([D, D, D, D, D, C, U]);
    expect(statuses("SHIPPED")).toEqual([D, D, D, D, D, D, C]);
    expect(statuses("DELIVERED")).toEqual([D, D, D, D, D, D, C]);
  });

  it("keeps Paid current until the capture lands", () => {
    // An order exists but no money moved, so the Paid step is not done yet.
    expect(statuses("PAYMENT_PENDING")).toEqual([D, D, D, D, C, U, U]);
  });

  it("has nothing done on a draft, where no invite has gone out", () => {
    expect(statuses("DRAFT")).toEqual([C, U, U, U, U, U, U]);
  });

  it("is all done and complete at Complete", () => {
    const p = dealProgress("COMPLETE", []);
    expect(p.steps.every((s) => s.status === "done")).toBe(true);
    expect(p.complete).toBe(true);
    expect(p.end).toBeNull();
  });

  it("keeps the steps a blocked deal reached and ends with a Blocked badge", () => {
    const p = dealProgress("BLOCKED", [ev("seller_invited"), ev("card_updated"), ev("review_posted")]);
    expect(p.steps.map((s) => s.status)).toEqual([D, D, D]);
    expect(p.end).toEqual({ kind: "blocked", label: "Blocked" });
    expect(p.notReached).toEqual(["Agreed and locked", "Paid", "Shipped", "Arrived"]);
    expect(p.complete).toBe(false);
  });

  it("a refusal with no card is blocked after the review of what the seller said", () => {
    const p = dealProgress("BLOCKED", [ev("seller_invited"), ev("invite_declined"), ev("review_posted")]);
    expect(p.steps.map((s) => s.status)).toEqual([D, D, D]);
  });

  it("an issue after arrival keeps everything through Arrived done and ends with Issue open", () => {
    const p = dealProgress("ISSUE", [ev("card_updated"), ev("review_posted"), ev("card_locked"), ev("payment_captured"), ev("shipped"), ev("delivered"), ev("arrival_checked")]);
    expect(p.steps.every((s) => s.status === "done")).toBe(true);
    expect(p.end).toEqual({ kind: "issue", label: "Issue open" });
  });

  it("a cancelled deal keeps what it reached", () => {
    const p = dealProgress("CANCELLED", [ev("card_updated")]);
    expect(p.steps.map((s) => s.status)).toEqual([D, D]);
    expect(p.end).toEqual({ kind: "cancelled", label: "Cancelled" });
  });

  it("never shows a current step on a deal that ended early", () => {
    for (const state of ["BLOCKED", "ISSUE", "CANCELLED"] as const) {
      expect(dealProgress(state, [ev("card_locked")]).steps.some((s) => s.status === "current")).toBe(false);
    }
  });
});

describe("a deal the buyer took off Pay Pals", () => {
  const offPlatform = [ev("seller_invited"), ev("card_updated"), ev("review_posted"), ev("card_locked"), ev("off_platform_chosen")];

  it("does not advance the steps, because nothing was paid through Pay Pals", () => {
    // Cancelled at the payment step: four steps reached, and Paid never ticks.
    expect(statuses("CANCELLED", offPlatform)).toEqual([D, D, D, D]);
  });

  it("carries its own end badge rather than the state it left behind", () => {
    expect(dealProgress("CANCELLED", offPlatform).end).toEqual({ kind: "off_platform", label: "Paying another way" });
    // The blocked case, which is the one the control exists for.
    expect(dealProgress("BLOCKED", [ev("review_posted"), ev("off_platform_chosen")]).end).toEqual({ kind: "off_platform", label: "Paying another way" });
  });

  it("leaves every other ending alone", () => {
    expect(dealProgress("CANCELLED", [ev("review_posted")]).end).toEqual({ kind: "cancelled", label: "Cancelled" });
    expect(dealProgress("BLOCKED", [ev("review_posted")]).end).toEqual({ kind: "blocked", label: "Blocked" });
    expect(dealProgress("ISSUE", [ev("delivered")]).end).toEqual({ kind: "issue", label: "Issue open" });
    expect(dealProgress("AGREED", []).end).toBeNull();
  });
});

describe("progressStatusText", () => {
  it("says where a deal stopped, in words", () => {
    expect(progressStatusText(dealProgress("BLOCKED", [ev("seller_invited"), ev("card_updated"), ev("review_posted")]))).toBe("Stopped at Reviewed");
    expect(progressStatusText(dealProgress("ISSUE", [ev("arrival_checked")]))).toBe("Issue at Arrived");
    expect(progressStatusText(dealProgress("CANCELLED", [ev("seller_invited"), ev("card_updated")]))).toBe("Cancelled at Card");
  });

  it("names the last step reached while a deal is moving, and that it is finished when it is", () => {
    expect(progressStatusText(dealProgress("PAID", []))).toBe("Paid");
    expect(progressStatusText(dealProgress("REVIEWED", []))).toBe("Reviewed");
    expect(progressStatusText(dealProgress("COMPLETE", []))).toBe("Arrived");
    expect(progressStatusText(dealProgress("DRAFT", []))).toBe("Not started");
  });

  it("labels all seven segments", () => {
    expect(Object.values(SEGMENT_LABELS)).toEqual(["Invited", "Card", "Reviewed", "Agreed", "Paid", "Shipped", "Arrived"]);
  });
});
