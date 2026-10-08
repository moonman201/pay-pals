import type { DealEvent, DealEventKind } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { dealProgress, PROGRESS_STEPS } from "./progress";

const ev = (kind: DealEventKind): DealEvent =>
  ({ id: kind, dealId: "d", kind, actor: "system", summary: kind, at: "2026-10-01T00:00:00.000Z", prevHash: null, hash: "0".repeat(64) }) as DealEvent;

const statuses = (state: Parameters<typeof dealProgress>[0], events: DealEvent[] = []) => dealProgress(state, events).steps.map((s) => s.status);

describe("dealProgress", () => {
  it("names the seven steps in order", () => {
    expect(dealProgress("INVITED", []).steps.map((s) => s.label)).toEqual(["Invited", "Card built", "Reviewed", "Agreed and locked", "Paid", "Shipped", "Arrived"]);
    expect(PROGRESS_STEPS).toHaveLength(7);
  });

  it("marks the state's step current and the ones before it done", () => {
    expect(statuses("INVITED")).toEqual(["current", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(statuses("LISTED")).toEqual(["done", "current", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(statuses("REVIEWED")).toEqual(["done", "done", "current", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(statuses("AGREED")).toEqual(["done", "done", "done", "current", "upcoming", "upcoming", "upcoming"]);
    expect(statuses("PAYMENT_PENDING")).toEqual(["done", "done", "done", "done", "current", "upcoming", "upcoming"]);
  });

  it("treats Paid and Delivered as finished steps, with the next one current", () => {
    expect(statuses("PAID")).toEqual(["done", "done", "done", "done", "done", "current", "upcoming"]);
    expect(statuses("SHIPPED")).toEqual(["done", "done", "done", "done", "done", "current", "upcoming"]);
    expect(statuses("DELIVERED")).toEqual(["done", "done", "done", "done", "done", "done", "current"]);
  });

  it("is all done and complete at Complete", () => {
    const p = dealProgress("COMPLETE", []);
    expect(p.steps.every((s) => s.status === "done")).toBe(true);
    expect(p.complete).toBe(true);
    expect(p.end).toBeNull();
  });

  it("keeps the steps a blocked deal reached and ends with a Blocked badge", () => {
    const p = dealProgress("BLOCKED", [ev("seller_invited"), ev("card_updated"), ev("review_posted")]);
    expect(p.steps.map((s) => s.status)).toEqual(["done", "done", "done", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(p.end).toEqual({ kind: "blocked", label: "Blocked" });
    expect(p.complete).toBe(false);
  });

  it("a refusal with no card is blocked after Invited alone", () => {
    const p = dealProgress("BLOCKED", [ev("seller_invited"), ev("invite_declined"), ev("review_posted")]);
    // review_posted counts as reviewed even with no card, which is what happened.
    expect(p.steps.map((s) => s.status)).toEqual(["done", "done", "done", "upcoming", "upcoming", "upcoming", "upcoming"]);
  });

  it("an issue after arrival keeps everything through Arrived done and ends with Issue open", () => {
    const p = dealProgress("ISSUE", [ev("card_updated"), ev("review_posted"), ev("card_locked"), ev("payment_captured"), ev("shipped"), ev("delivered"), ev("arrival_checked")]);
    expect(p.steps.every((s) => s.status === "done")).toBe(true);
    expect(p.end).toEqual({ kind: "issue", label: "Issue open" });
  });

  it("a cancelled deal keeps what it reached", () => {
    const p = dealProgress("CANCELLED", [ev("card_updated")]);
    expect(p.steps.map((s) => s.status)).toEqual(["done", "done", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(p.end).toEqual({ kind: "cancelled", label: "Cancelled" });
  });
});
