import { cleanPs5, fakeSlab, type PriceCheck } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { conditionBucket, methodNote, priceText, retailRange, summariseSources } from "./price-sources";

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

describe("retailRange", () => {
  /**
   * The clean deal's stored verdict as production holds it, read off the live
   * API on Oct 11: a method note, then 12 priced listings, 11 of them new.
   * The derived band on the same check is 412.29 to 640.49, which is not any
   * of these numbers, which is the whole reason this function exists.
   */
  const live = [
    { name: "Widened to the playstation disc family; Estimated for a used unit from new retail prices (good: 70% of new), scaled from 11 new listings priced $588.99 to $914.99" },
    { name: "Retail listing, new", price: 588.99, condition: "new", url: "https://shop.example/1" },
    { name: "Used listing", price: 588.99, condition: "used", url: "https://shop.example/2" },
    { name: "Retail listing, new", price: 649.99, condition: "new", url: "https://shop.example/3" },
    { name: "Retail listing, new", price: 649.99, condition: "new", url: "https://shop.example/4" },
    { name: "Retail listing, new", price: 776.99, condition: "new", url: "https://shop.example/5" },
    { name: "Retail listing, new", price: 779.99, condition: "new", url: "https://shop.example/6" },
    { name: "Retail listing, new", price: 824.99, condition: "new", url: "https://shop.example/7" },
    { name: "Retail listing, new", price: 858.99, condition: "new", url: "https://shop.example/8" },
    { name: "Retail listing, new", price: 879.99, condition: "new", url: "https://shop.example/9" },
    { name: "Retail listing, new", price: 879.99, condition: "new", url: "https://shop.example/10" },
    { name: "Retail listing, new", price: 899.99, condition: "new", url: "https://shop.example/11" },
    { name: "Retail listing, new", price: 914.99, condition: "new", url: "https://shop.example/12" },
  ];

  it("returns the range Channel3 gave, not the band derived from it", () => {
    const range = retailRange(check(live))!;
    expect(range.low).toBe(588.99);
    expect(range.high).toBe(914.99);
    expect(range.text).toBe("$588.99 to $914.99");
    // The derived band on the same check. Neither end of it may leak into this range.
    expect(range.text).not.toContain("412");
    expect(range.text).not.toContain("640");
  });

  it("counts the new listings only, so the used one at the same price is not one of them", () => {
    const range = retailRange(check(live))!;
    expect(range.count).toBe(11);
    expect(range.countLine).toBe("across 11 new listings");
  });

  it("leaves the priceless method note out of both the count and the range", () => {
    const withNote = retailRange(check(live))!;
    const withoutNote = retailRange(check(live.slice(1)))!;
    expect(withNote).toEqual(withoutNote);
    // 13 sources in, 11 counted: the note is not a listing and the used one is not new.
    expect(check(live).sources).toHaveLength(13);
    expect(withNote.count).toBe(11);
  });

  it("refuses a note that carries a condition, because it still has no price", () => {
    expect(retailRange(check([{ name: "Scaled from new retail prices", condition: "new" }]))).toBeNull();
  });

  it("refuses a zero price, which is not a price", () => {
    expect(retailRange(check([{ name: "Retail listing, new", price: 0, condition: "new" }]))).toBeNull();
  });

  it("prints one price rather than a range when every new listing agreed", () => {
    const range = retailRange(check([
      { name: "Retail listing, new", price: 649.99, condition: "new" },
      { name: "Retail listing, new", price: 649.99, condition: "new" },
    ]))!;
    expect(range.text).toBe("$649.99");
    expect(range.text).not.toContain(" to ");
    expect(range.countLine).toBe("across 2 new listings");
  });

  it("names one listing in the singular", () => {
    expect(retailRange(check([{ name: "Retail listing, new", price: 500, condition: "new" }]))!.countLine).toBe("across 1 new listing");
  });

  it("is nothing when the lookup returned no new listing at all", () => {
    expect(retailRange(check([{ name: "Used listing", price: 380, condition: "good" }]))).toBeNull();
    // "Like new" is a used item, the same call conditionBucket makes everywhere else.
    expect(retailRange(check([{ name: "Graded sale", price: 418, condition: "like_new" }]))).toBeNull();
    expect(retailRange(check([{ name: "A listing with no condition stated", price: 418 }]))).toBeNull();
    expect(retailRange(check([]))).toBeNull();
    expect(retailRange(null)).toBeNull();
    expect(retailRange(undefined)).toBeNull();
  });

  it("names no shop, the same as every other line on this panel", () => {
    const range = retailRange(check([{ name: "gamestop.com", price: 588.99, condition: "new" }]))!;
    expect(`${range.text} ${range.countLine}`).not.toMatch(/gamestop|\.com/i);
  });

  it("reads the clean fixture, whose one new listing is the retail end of it", () => {
    const range = retailRange(cleanPs5.marketPrice)!;
    expect(range.count).toBe(1);
    expect(range.text).toBe("$499.00");
  });
});

describe("priceText", () => {
  it("gives every figure two places, so the asking price and the range read as one comparison", () => {
    expect(priceText(420)).toBe("$420.00");
    expect(priceText(588.99)).toBe("$588.99");
    expect(priceText(0)).toBe("$0.00");
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
