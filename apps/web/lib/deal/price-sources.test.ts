import { cleanPs5, type PriceCheck } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { conditionBucket, summariseSources } from "./price-sources";

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

  it("leaves out a split nobody stated, and a price nobody gave", () => {
    expect(summariseSources(check([{ name: "x" }, { name: "y" }]))!.line).toBe("From 2 listings");
    expect(summariseSources(check([{ name: "x", price: 100 }]))!.line).toBe("From 1 listing: $100");
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
