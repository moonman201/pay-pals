import type { PriceCheck } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { hasUsableRange, NO_PRICE, priceRangeLine, priceSourceNote } from "./price-copy";

const check = (marketLow: number, marketHigh: number, provider: PriceCheck["provider"] = "channel3"): PriceCheck => ({
  marketLow,
  marketHigh,
  currency: "USD",
  provider,
  sources: [],
  checkedAt: "2026-10-08T00:00:00.000Z",
});

describe("price copy", () => {
  it("renders a range only when both ends are positive and different", () => {
    expect(priceRangeLine(check(380, 499))).toBe("Market range $380 to $499");
    expect(hasUsableRange(check(380, 499))).toBe(true);
  });

  it("says no reliable price for null, zero or a flat range", () => {
    expect(priceRangeLine(null)).toBe(NO_PRICE);
    expect(priceRangeLine(check(0, 0))).toBe(NO_PRICE);
    expect(priceRangeLine(check(0, 500))).toBe(NO_PRICE);
    expect(priceRangeLine(check(450, 450))).toBe(NO_PRICE);
    expect(hasUsableRange(check(450, 450))).toBe(false);
  });

  it("names the source", () => {
    expect(priceSourceNote(check(1, 2, "channel3"))).toBe("via Channel3");
    expect(priceSourceNote(check(1, 2, "fixture"))).toBe("demo prices");
    expect(priceSourceNote(null)).toBe("no price source was available");
  });
});
