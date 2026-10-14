import { cleanPs5, emptyBox, fakeSlab } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
// Pinned to the agents' own code. These are relative imports into another package on purpose and only
// here, in a test: the client bundle cannot import @pay-pals/agents, so the mapping is mirrored in
// price-stance.ts and this test is what stops the two from drifting (the headline.test.ts pattern).
import { pricePosition as agentsPricePosition, pricePositionVerb as agentsVerb } from "../../../../packages/agents/src/price/price-position";
import { CAUTION_RATIO as AGENTS_CAUTION_RATIO } from "../../../../packages/agents/src/rules/price-below-market";
import { ESTIMATE_NOTE_PREFIX as AGENTS_ESTIMATE_PREFIX } from "../../../../packages/agents/src/price/channel3-lookup";
import { CAUTION_RATIO, ESTIMATE_NOTE_PREFIX, pricePosition, pricePositionVerb, priceStance } from "./price-stance";

describe("price stance mirrors the agents package", () => {
  it("uses the same constants", () => {
    expect(CAUTION_RATIO).toBe(AGENTS_CAUTION_RATIO);
    expect(ESTIMATE_NOTE_PREFIX).toBe(AGENTS_ESTIMATE_PREFIX);
  });

  it("classifies every ask the way the agents do, at and around each edge", () => {
    for (const [low, high] of [
      [412.29, 615.99],
      [380, 499],
      [100, 100.5],
    ] as const) {
      const edges = [0.01, low * 0.5, low * CAUTION_RATIO - 0.01, low * CAUTION_RATIO, low * 0.9, low - 0.01, low, (low + high) / 2, high, high + 0.01, high * 2];
      for (const ask of edges) {
        const mine = pricePosition(ask, low, high);
        expect(mine, `${ask} against ${low} to ${high}`).toBe(agentsPricePosition(ask, low, high));
        expect(pricePositionVerb(mine)).toBe(agentsVerb(agentsPricePosition(ask, low, high)));
      }
    }
  });
});

describe("priceStance", () => {
  it("clean deal: $420 inside the used range is a fair used price, not 'in range of retail'", () => {
    const card = cleanPs5.cards[cleanPs5.cards.length - 1]!;
    const stance = priceStance(cleanPs5.marketPrice, card)!;
    expect(stance.position).toBe("inside");
    expect(stance.usedRange).toBe(true);
    expect(stance.label).toBe("Fair used price");
    expect(stance.tone).toBe("go");
    expect(stance.sentence).toBe("The $420 ask sits inside the $380 to $499 used range.");
  });

  it("names the other three positions in the same words as the pal's sentence", () => {
    const card = cleanPs5.cards[cleanPs5.cards.length - 1]!;
    const check = { ...cleanPs5.marketPrice, marketLow: 412.29, marketHigh: 615.99 };
    expect(priceStance(check, { ...card, askingPrice: 410 })!.label).toBe("Just under used range");
    expect(priceStance(check, { ...card, askingPrice: 250 })!.label).toBe("Under used range");
    expect(priceStance(check, { ...card, askingPrice: 700 })!.label).toBe("Above used range");
    expect(priceStance(check, { ...card, askingPrice: 410 })!.sentence).toContain("is just under");
  });

  it("a new item gets plain range wording, not 'used'", () => {
    const card = { ...cleanPs5.cards[cleanPs5.cards.length - 1]!, conditionGrade: "new" as const };
    expect(priceStance(cleanPs5.marketPrice, card)!.label).toBe("In price range");
  });

  it("never invents a price for a graded card, whatever the check returned", () => {
    const slab = fakeSlab.cards[fakeSlab.cards.length - 1]!;
    // The slab fixture carries no range now (F14); give the check one anyway, which is the case being guarded.
    const returned = { ...cleanPs5.marketPrice, marketLow: 305, marketHigh: 493 };
    expect(priceStance(returned, slab)).toBeNull();
  });

  it("says nothing without a usable price result", () => {
    const card = emptyBox.cards[emptyBox.cards.length - 1]!;
    expect(priceStance(null, card)).toBeNull();
    expect(priceStance({ ...emptyBox.marketPrice, marketLow: 0, marketHigh: 0 }, card)).toBeNull();
  });
});
