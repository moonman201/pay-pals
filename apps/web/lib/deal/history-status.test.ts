import { chainEvents, cleanPs5, type DealEvent } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { historyLine, historyStatus } from "./history-status";

const events: DealEvent[] = chainEvents(cleanPs5.timeline.map(({ prevHash: _p, hash: _h, ...rest }) => rest));
const headAtOrder = events.find((e) => e.kind === "payment_created")!.hash;

describe("historyStatus", () => {
  it("verifies when the stored events reproduce the hash on the order", () => {
    const status = historyStatus(events, headAtOrder);
    expect(status).toEqual({ kind: "verified", events: events.length });
    expect(historyLine(status)).toBe("History unchanged since PayPal order");
  });

  it("warns when an event before the order was edited", () => {
    const edited = events.map((e, i) => (i === 2 ? { ...e, summary: e.summary + " (edited)" } : e));
    const status = historyStatus(edited, headAtOrder);
    expect(status.kind).toBe("mismatch");
    expect(historyLine(status)).toBe("History does not match the hash on the PayPal order");
    if (status.kind === "mismatch") expect(status.brokenAt).toBe(2);
  });

  it("warns when the hash on the order is not in the chain at all", () => {
    expect(historyStatus(events, "f".repeat(64)).kind).toBe("mismatch");
  });

  it("gives a count and no verdict before any order", () => {
    const beforeOrder = events.slice(0, 5);
    const status = historyStatus(beforeOrder, null);
    expect(status).toEqual({ kind: "unanchored", events: 5, chainOk: true });
    expect(historyLine(status)).toBe("Tamper-evident history, 5 events");
    // Matt's rule 6: plain words. "Hash-chained" says how it works, not what it gives you.
    expect(historyLine(status)).not.toMatch(/hash|chain/i);
    expect(historyLine(historyStatus([events[0]!], undefined))).toBe("Tamper-evident history, 1 event");
  });
});
