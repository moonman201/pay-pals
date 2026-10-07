import { describe, expect, it } from "vitest";
import { canonicalJson, chainEvents, hashEvent, historyMatchesHead, verifyChain } from "./history";

const base = { dealId: "d1", actor: "system" as const, summary: "x", at: "2026-10-20T14:00:00.000Z" };

describe("history hash chain", () => {
  it("canonical json sorts keys and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: undefined, c: [1, null] } })).toBe('{"a":{"c":[1,null]},"b":1}');
  });

  it("is deterministic and sensitive to every hashed field", () => {
    const h1 = hashEvent(null, { ...base, kind: "deal_created" });
    expect(hashEvent(null, { ...base, kind: "deal_created" })).toBe(h1);
    expect(hashEvent(null, { ...base, kind: "card_updated" })).not.toBe(h1);
    expect(hashEvent("0".repeat(64), { ...base, kind: "deal_created" })).not.toBe(h1);
    expect(hashEvent(null, { ...base, kind: "deal_created", summary: "y" })).not.toBe(h1);
  });

  it("chains, verifies, and detects an edit after the fact", () => {
    const events = chainEvents([
      { id: "e1", ...base, kind: "deal_created" as const },
      { id: "e2", ...base, kind: "state_changed" as const, fromState: "DRAFT" as const, toState: "LISTED" as const },
      { id: "e3", ...base, kind: "review_posted" as const },
    ]);
    expect(events[0]!.prevHash).toBeNull();
    expect(events[1]!.prevHash).toBe(events[0]!.hash);
    expect(verifyChain(events)).toEqual({ ok: true, head: events[2]!.hash, brokenAt: null });

    const edited = events.map((e, i) => (i === 1 ? { ...e, summary: "edited later" } : e));
    expect(verifyChain(edited).ok).toBe(false);
    expect(verifyChain(edited).brokenAt).toBe(1);
  });

  it("matches a head recorded on the order even when later events exist", () => {
    const events = chainEvents([
      { id: "e1", ...base, kind: "deal_created" as const },
      { id: "e2", ...base, kind: "payment_created" as const },
      { id: "e3", ...base, kind: "shipped" as const },
    ]);
    expect(historyMatchesHead(events, events[1]!.hash)).toBe(true);
    expect(historyMatchesHead(events, "f".repeat(64))).toBe(false);
  });
});
