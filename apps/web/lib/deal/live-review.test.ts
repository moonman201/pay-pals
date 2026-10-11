import { cleanPs5, type CertCheck, type RedFlag, type ReviewProgress } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { agreeLockedLine, applyProgress, hasStopFlag, IDLE_REVIEW, liveReviewLine, nothingYet, orderedFlags, startedReview, type LiveReviewState } from "./live-review";

function flag(code: RedFlag["code"], severity: RedFlag["severity"]): RedFlag {
  return { code, severity, evidence: "what the seller wrote", explanation: `Something about ${code}.`, raisedByRule: true };
}

const certCheck: CertCheck = { record: { provider: "fixture", certNumber: "72096346", subject: "A card", grade: "GEM MT 10", year: "2018", brand: "P.M.", raw: null, checkedAt: "2026-10-10T00:00:00.000Z" }, matches: true, explanation: "Agrees." };

const EVENTS: ReviewProgress[] = [
  { kind: "stage", stage: "reading the chat" },
  { kind: "flag", flag: flag("URGENCY_PRESSURE", "caution") },
  { kind: "priceCheck", priceCheck: cleanPs5.marketPrice },
  { kind: "flag", flag: flag("FRIENDS_AND_FAMILY_REQUEST", "stop") },
  { kind: "certCheck", certCheck },
  { kind: "photoRead", url: "https://example.test/a.jpg", readable: true },
  { kind: "photoRead", url: "https://example.test/b.jpg", readable: false },
  { kind: "stage", stage: "writing the verdict" },
];

function applyAll(events: readonly ReviewProgress[], from: LiveReviewState = startedReview()): LiveReviewState {
  return events.reduce(applyProgress, from);
}

/** Every ordering of a small list would be 40320 cases; these are enough to catch an order dependency. */
function shuffles(events: readonly ReviewProgress[]): ReviewProgress[][] {
  const out: ReviewProgress[][] = [[...events], [...events].reverse()];
  for (let seed = 1; seed <= 6; seed++) {
    const copy = [...events];
    // A fixed rotation per seed: deterministic, so a failure is reproducible.
    out.push(copy.slice(seed).concat(copy.slice(0, seed)));
  }
  return out;
}

describe("applyProgress is order independent", () => {
  it("reaches the same findings whatever order they land in", () => {
    const base = applyAll(EVENTS);
    for (const [i, order] of shuffles(EVENTS).entries()) {
      const state = applyAll(order);
      expect(orderedFlags(state.flags), `shuffle ${i}`).toEqual(orderedFlags(base.flags));
      expect(state.priceCheck, `shuffle ${i}`).toEqual(base.priceCheck);
      expect(state.certCheck, `shuffle ${i}`).toEqual(base.certCheck);
      expect([...state.photoReads].sort((a, b) => a.url.localeCompare(b.url)), `shuffle ${i}`).toEqual([...base.photoReads].sort((a, b) => a.url.localeCompare(b.url)));
      expect(hasStopFlag(state), `shuffle ${i}`).toBe(true);
    }
  });

  it("sorts the flags loudest first, so the page does not reshuffle as answers come back", () => {
    const state = applyAll(EVENTS);
    expect(orderedFlags(state.flags).map((f) => f.severity)).toEqual(["stop", "caution"]);
  });

  it("counts a flag raised twice as one finding, because a rule and the model can both raise it", () => {
    const twice = applyAll([
      { kind: "flag", flag: flag("URGENCY_PRESSURE", "caution") },
      { kind: "flag", flag: { ...flag("URGENCY_PRESSURE", "stop"), explanation: "The model said more about it." } },
    ]);
    expect(twice.flags).toHaveLength(1);
    expect(twice.flags[0]!.explanation).toBe("The model said more about it.");
  });

  it("keeps only the latest stage", () => {
    expect(applyAll(EVENTS).stage).toBe("writing the verdict");
  });

  it("counts a photo read once however many times it lands", () => {
    const state = applyAll([
      { kind: "photoRead", url: "https://example.test/a.jpg", readable: false },
      { kind: "photoRead", url: "https://example.test/a.jpg", readable: true },
    ]);
    expect(state.photoReads).toEqual([{ url: "https://example.test/a.jpg", readable: true }]);
  });

  it("tells a lookup that answered null apart from one that has not answered", () => {
    expect(startedReview().priceChecked).toBe(false);
    const none = applyAll([{ kind: "priceCheck", priceCheck: null }]);
    expect(none.priceChecked).toBe(true);
    expect(none.priceCheck).toBeNull();
  });
});

describe("a review in flight never reads as a clean result", () => {
  it("says the pal is still working before anything lands, not that nothing is wrong", () => {
    const line = liveReviewLine(startedReview());
    expect(nothingYet(startedReview())).toBe(true);
    expect(line).toBe("Your pal is still working. Nothing has come back yet, which is not the same as nothing being wrong.");
    expect(line.toLowerCase()).not.toMatch(/\b(no flags|nothing wrong|looks (fine|good|clean)|all clear)\b/);
  });

  it("says a stop has already landed and that more is still running", () => {
    const state = applyAll([{ kind: "flag", flag: flag("FRIENDS_AND_FAMILY_REQUEST", "stop") }]);
    expect(liveReviewLine(state)).toMatch(/already found something that stops this deal/);
    expect(liveReviewLine(state)).toMatch(/More checks are still running/);
  });

  it("says what is shown is partial once anything has landed", () => {
    const state = applyAll([{ kind: "priceCheck", priceCheck: cleanPs5.marketPrice }]);
    expect(liveReviewLine(state)).toMatch(/not the whole review/);
  });

  it("says a failed review failed, and that nothing shown is a verdict", () => {
    const state: LiveReviewState = { ...startedReview(), error: "Claude did not answer." };
    expect(liveReviewLine(state)).toMatch(/did not finish/);
    expect(liveReviewLine(state)).toMatch(/Nothing here is a verdict/);
  });

  it("says nothing at all when no review is running", () => {
    expect(liveReviewLine(IDLE_REVIEW)).toBe("");
    expect(agreeLockedLine(IDLE_REVIEW)).toBe("");
  });

  it("says why Agree is locked, while it is locked", () => {
    expect(agreeLockedLine(startedReview())).toBe("Agree is locked until the review is complete, so nobody agrees on half the findings.");
  });

  it("writes no em dashes", () => {
    for (const state of [startedReview(), applyAll(EVENTS), { ...startedReview(), error: "x" }]) {
      expect(liveReviewLine(state)).not.toContain("—");
      expect(agreeLockedLine(state)).not.toContain("—");
    }
  });
});
