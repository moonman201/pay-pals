import { ARRIVAL_OUTCOMES, type ArrivalCheck, type Mismatch } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { ASK_FOR_A_CLEARER_PHOTO, CLAIMS_NEITHER, describeComparisons, isConfirmedMismatch, outcomeOf, OUTCOME_LABEL, outcomeSentence, unsettledOf } from "./arrival-outcome";

const NEAR_MISS: Mismatch = {
  field: "serial",
  expected: "AJ164952580",
  observed: "AJ16495258O",
  explanation: "They differ only at character 11, 0 against O, which is what a misread of one character looks like.",
};

const WRONG_ITEM: Mismatch = { field: "serial", expected: "AJ164952580", observed: "no console in the photos", explanation: "The box arrived without the item." };

function check(overrides: Partial<ArrivalCheck> = {}): ArrivalCheck {
  return {
    dealId: "d",
    cardVersion: 2,
    outcome: "match",
    mismatches: [],
    observed: { brand: "Sony", model: "PlayStation 5", serial: "AJ164952580" },
    palMessage: "It is the same console.",
    createdAt: "2026-10-10T12:00:00.000Z",
    ...overrides,
  };
}

describe("outcomeOf", () => {
  it("reads the three values straight through", () => {
    for (const outcome of ARRIVAL_OUTCOMES) expect(outcomeOf({ outcome })).toBe(outcome);
  });

  it("reads a row stored before v1.8.0, which carries matches and no outcome", () => {
    // No migration came with the field, and an arrival check round-trips as jsonb, so every row
    // already in the database looks like this. `false` meant a positive difference when it was
    // written, so translating it to "mismatch" is faithful rather than a guess.
    expect(outcomeOf({ matches: true } as never)).toBe("match");
    expect(outcomeOf({ matches: false } as never)).toBe("mismatch");
  });

  it("reads a row with neither field as inconclusive, which claims nothing", () => {
    expect(outcomeOf({} as never)).toBe("inconclusive");
    expect(outcomeOf({ outcome: "nonsense" } as never)).toBe("inconclusive");
    expect(outcomeOf({ matches: "yes" } as never)).toBe("inconclusive");
  });

  it("never lets a malformed row read as a match, which is the only reading that would be dangerous", () => {
    for (const bad of [{}, { outcome: null }, { outcome: "" }, { matches: 1 }, { matches: "true" }]) {
      expect(outcomeOf(bad as never), JSON.stringify(bad)).not.toBe("match");
    }
  });
});

describe("unsettledOf", () => {
  it("is empty unless the check carries one, so an older row reads as nothing unsettled", () => {
    expect(unsettledOf(check())).toEqual([]);
    expect(unsettledOf({ unsettled: undefined })).toEqual([]);
    expect(unsettledOf({ unsettled: [NEAR_MISS] })).toEqual([NEAR_MISS]);
  });
});

describe("OUTCOME_LABEL", () => {
  it("has a word for every outcome, and the middle one is neither a pass nor a fail", () => {
    for (const outcome of ARRIVAL_OUTCOMES) expect(OUTCOME_LABEL[outcome].length).toBeGreaterThan(0);
    expect(OUTCOME_LABEL.match).toBe("matches");
    expect(OUTCOME_LABEL.mismatch).toBe("does not match");
    expect(OUTCOME_LABEL.inconclusive).toBe("not settled");
    // The word for an unsettled check must not be read as either of the other two.
    expect(OUTCOME_LABEL.inconclusive).not.toContain("match");
  });
});

describe("outcomeSentence", () => {
  it("says a match plainly", () => {
    expect(outcomeSentence(check())).toBe("Arrival matches the locked card.");
  });

  it("names what differed on a mismatch", () => {
    const sentence = outcomeSentence(check({ outcome: "mismatch", mismatches: [WRONG_ITEM] }));
    expect(sentence).toBe("Arrival does not match. serial: card says AJ164952580, arrived no console in the photos.");
  });

  it("claims neither thing on an inconclusive check, and names both numbers", () => {
    const sentence = outcomeSentence(check({ outcome: "inconclusive", mismatches: [], unsettled: [NEAR_MISS] }));
    expect(sentence).toContain("Arrival not settled.");
    expect(sentence).toContain("AJ164952580");
    expect(sentence).toContain("AJ16495258O");
    expect(sentence).toContain(CLAIMS_NEITHER);
    // Never either verdict.
    expect(sentence).not.toMatch(/Arrival matches|does not match/);
  });

  it("never reads an inconclusive check off its empty mismatches list", () => {
    // The trap: mismatches is empty on an inconclusive check, so a branch that counted it
    // would say "found 0 differences" and list nothing.
    const sentence = outcomeSentence(check({ outcome: "inconclusive", mismatches: [], unsettled: [NEAR_MISS] }));
    expect(sentence).not.toMatch(/0 differences|: \./);
  });

  it("still claims neither thing when the unsettled list did not come through", () => {
    const sentence = outcomeSentence(check({ outcome: "inconclusive", mismatches: [] }));
    expect(sentence).toContain(CLAIMS_NEITHER);
    expect(sentence).not.toMatch(/undefined|\[object/);
  });

  it("writes no em dashes, whatever the outcome", () => {
    for (const outcome of ARRIVAL_OUTCOMES) {
      expect(outcomeSentence(check({ outcome, mismatches: outcome === "mismatch" ? [WRONG_ITEM] : [], unsettled: outcome === "inconclusive" ? [NEAR_MISS] : [] }))).not.toContain("—");
    }
  });
});

describe("isConfirmedMismatch", () => {
  it("is true only for a positive finding of the wrong item", () => {
    expect(isConfirmedMismatch(check({ outcome: "mismatch" }))).toBe(true);
    expect(isConfirmedMismatch(check({ outcome: "match" }))).toBe(false);
    // The one that matters: an unsettled comparison is not a finding against the seller.
    expect(isConfirmedMismatch(check({ outcome: "inconclusive" }))).toBe(false);
    expect(isConfirmedMismatch(null)).toBe(false);
    expect(isConfirmedMismatch(undefined)).toBe(false);
  });
});

describe("describeComparisons", () => {
  it("names the card's number and the arrival's, in that order", () => {
    expect(describeComparisons([NEAR_MISS])).toBe("serial: card says AJ164952580, arrived AJ16495258O");
  });

  it("joins several without inventing a verdict about any of them", () => {
    const joined = describeComparisons([NEAR_MISS, { ...NEAR_MISS, field: "model", expected: "CFI-1015A", observed: "CFI-1015B" }]);
    expect(joined).toBe("serial: card says AJ164952580, arrived AJ16495258O; model: card says CFI-1015A, arrived CFI-1015B");
  });

  it("is empty for nothing, rather than a stray separator", () => {
    expect(describeComparisons([])).toBe("");
  });
});

describe("the shared sentences", () => {
  it("say the pal claims neither thing, and what would settle it", () => {
    expect(CLAIMS_NEITHER).toBe("The Buyer Pal is not calling that a match and not calling it a mismatch.");
    expect(ASK_FOR_A_CLEARER_PHOTO).toMatch(/clearer photo of that label/);
  });
});
