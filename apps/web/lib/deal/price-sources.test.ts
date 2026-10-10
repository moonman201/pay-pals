import { cleanPs5, fakeSlab, type PriceCheck } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { conditionBucket, methodNote, summariseSources } from "./price-sources";

const check = (sources: PriceCheck["sources"]): PriceCheck => ({ marketLow: 380, marketHigh: 499, currency: "USD", sources, provider: "channel3", checkedAt: "2026-10-09T00:00:00.000Z" });

describe("conditionBucket", () => {
  it("counts only a plainly new item as new", () => {
    expect(conditionBucket("new")).toBe("new");
    expect(conditionBucket("Brand New")).toBe("new");
    expect(conditionBucket("like_new")).toBe("used");
    expect(conditionBucket("good")).toBe("used");
    expect(conditionBucket(undefined)).toBe("unknown");
    expect(conditionBucket("  ")).toBe("unknown");
  });
});

describe("summariseSources", () => {
  it("says how many listings, how they split and what they cost, with no shop names", () => {
    const summary = summariseSources(check([
      { name: "gamestop.com", price: 588.99, condition: "new" },
      { name: "A marketplace listing", price: 914.99, condition: "used" },
      { name: "Another shop", price: 700, condition: "new" },
    ]))!;
    expect(summary.line).toBe("From 3 listings: 2 new, 1 used, $588.99 to $914.99");
    expect(summary.line).not.toMatch(/gamestop|shop|marketplace/i);
    expect(summary.prices).toEqual([588.99, 700, 914.99]);
    expect(summary.count).toBe(3);
  });

  it("names one listing in the singular and prints a single price once", () => {
    expect(summariseSources(check([{ name: "x", price: 420, condition: "used" }]))!.line).toBe("From 1 listing: 1 used, $420");
  });

  it("leaves out a split nobody stated", () => {
    expect(summariseSources(check([{ name: "x", price: 100 }]))!.line).toBe("From 1 listing: $100");
  });

  it("counts listings, not sources: the lookup's method note sits in the same array", () => {
    // What the live PlayStation lookup returns: a note first, then the priced listings.
    const note = { name: "Estimated for a used unit from new retail prices (good: 70% of new), scaled from 11 new listings priced $588.99 to $949.99" };
    const priced = Array.from({ length: 12 }, (_, i) => ({ name: `listing ${i}`, url: `https://shop.example/${i}`, price: 589 + i, condition: "new" }));
    const summary = summariseSources(check([note, ...priced]))!;
    expect(summary.count).toBe(12);
    expect(summary.line).toBe("From 12 listings: 12 new, $589 to $600");
    expect(summary.line).not.toContain("13");
    expect(summary.prices).toHaveLength(12);
  });

  it("has nothing to summarise when the only source is the note", () => {
    expect(summariseSources(check([{ name: "No live quote was available." }]))).toBeNull();
  });

  it("has nothing to say without sources", () => {
    expect(summariseSources(check([]))).toBeNull();
    expect(summariseSources(null)).toBeNull();
    expect(summariseSources(undefined)).toBeNull();
  });

  it("reads the demo fixture the same way", () => {
    const summary = summariseSources(cleanPs5.marketPrice)!;
    expect(summary.count).toBe(cleanPs5.marketPrice.sources.length);
    expect(summary.line).toMatch(/^From \d+ listings: /);
    expect(summary.prices.length).toBeGreaterThan(0);
  });
});

describe("methodNote", () => {
  const note = "Estimated for a used unit from new retail prices (good: 70% of new), scaled from 11 new listings priced $588.99 to $949.99";

  it("reads the sentence the lookup put first, which has no price and no url", () => {
    expect(methodNote(check([{ name: note }, { name: "a listing", url: "https://shop.example/1", price: 589 }]))).toBe(note);
  });

  it("takes the first note that exists, not the note on the first source", () => {
    // The slab fixture's shape: the reference sentence is the last source, after the graded sales.
    const reference = "Reference range from recent PSA 10 sold prices for this card, October 2026.";
    const sources = [
      { name: "Graded sale, PSA 10", price: 418, condition: "like_new" },
      { name: "Graded sale, PSA 10", price: 305, condition: "like_new" },
      { name: reference },
    ];
    expect(methodNote(check(sources))).toBe(reference);
  });

  it("renders the slab fixture's own reference sentence", () => {
    expect(methodNote(fakeSlab.marketPrice)).toBe(fakeSlab.marketPrice.sources[fakeSlab.marketPrice.sources.length - 1]!.name);
  });

  it("takes the earlier of two notes", () => {
    expect(methodNote(check([{ name: "first note" }, { name: "a listing", price: 1 }, { name: "second note" }]))).toBe("first note");
  });

  it("is nothing when every source is a listing", () => {
    expect(methodNote(check([{ name: "a listing", url: "https://shop.example/1", price: 589 }]))).toBeNull();
    expect(methodNote(check([{ name: "a listing", price: 589 }]))).toBeNull();
    expect(methodNote(check([{ name: "a shop", url: "https://shop.example/1" }]))).toBeNull();
    expect(methodNote(check([]))).toBeNull();
    expect(methodNote(null)).toBeNull();
  });

  it("is nothing for a blank name", () => {
    expect(methodNote(check([{ name: "   " }]))).toBeNull();
  });
});
