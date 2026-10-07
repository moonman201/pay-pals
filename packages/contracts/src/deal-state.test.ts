import { describe, expect, it } from "vitest";
import {
  DEAL_STATES,
  DEAL_TRANSITIONS,
  IllegalTransitionError,
  assertTransition,
  canTransition,
  isCardEditable,
  isTerminal,
} from "./deal-state";

describe("deal state table", () => {
  it("covers every state", () => {
    for (const s of DEAL_STATES) expect(DEAL_TRANSITIONS[s]).toBeDefined();
  });

  it("walks the happy path in order", () => {
    const path = ["DRAFT", "LISTED", "REVIEWED", "AGREED", "PAYMENT_PENDING", "PAID", "SHIPPED", "DELIVERED", "COMPLETE"] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it("allows the three side exits only where the plan says", () => {
    expect(canTransition("REVIEWED", "BLOCKED")).toBe(true);
    expect(canTransition("LISTED", "BLOCKED")).toBe(false);
    expect(canTransition("DELIVERED", "ISSUE")).toBe(true);
    expect(canTransition("SHIPPED", "ISSUE")).toBe(false);
    expect(canTransition("AGREED", "CANCELLED")).toBe(true);
    expect(canTransition("PAID", "CANCELLED")).toBe(false);
  });

  it("never leaves a terminal state", () => {
    for (const s of ["COMPLETE", "BLOCKED", "ISSUE", "CANCELLED"] as const) {
      expect(isTerminal(s)).toBe(true);
      expect(DEAL_TRANSITIONS[s]).toHaveLength(0);
    }
  });

  it("locks the card from AGREED on", () => {
    expect(isCardEditable("REVIEWED")).toBe(true);
    expect(isCardEditable("AGREED")).toBe(false);
    expect(isCardEditable("PAID")).toBe(false);
  });

  it("throws a typed error on an illegal move", () => {
    expect(() => assertTransition("PAID", "DRAFT")).toThrow(IllegalTransitionError);
    expect(() => assertTransition("DRAFT", "LISTED")).not.toThrow();
  });
});
