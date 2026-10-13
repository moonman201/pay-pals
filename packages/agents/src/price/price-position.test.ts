import { describe, expect, it } from "vitest";
import { cleanPs5 } from "@pay-pals/contracts";
import { reviewReasoning } from "../buyer/review-reasons";
import { pricePosition } from "./price-position";

const reasons = (askingPrice: number, marketLow: number, marketHigh: number, flags: Parameters<typeof reviewReasoning>[0]["flags"] = []) =>
  reviewReasoning({
    card: { ...cleanPs5.cards[0]!, askingPrice },
    priceCheck: { ...cleanPs5.marketPrice, marketLow, marketHigh },
    certCheck: null,
    certLookupFailed: false,
    readings: [],
    flags,
    overall: "caution",
    seller: null,
    photoMatchRan: false,
    modelAvailable: false,
    serialReadFromPhoto: false,
  }).found.join(" ");

describe("where an ask sits against the market range", () => {
  it("classifies below, inside and above", () => {
    expect(pricePosition(410, 412.29, 615.99)).toBe("just_under");
    expect(pricePosition(412.29, 412.29, 615.99)).toBe("inside");
    expect(pricePosition(500, 412.29, 615.99)).toBe("inside");
    expect(pricePosition(700, 412.29, 615.99)).toBe("above");
    expect(pricePosition(250, 412.29, 615.99)).toBe("under");
  });

  it("says just under the range for $410 against $412.29, never inside", () => {
    const text = reasons(410, 412.29, 615.99);
    expect(text).toContain("The $410 ask is just under the $412.29 to $615.99 range.");
    expect(text).not.toContain("inside");
  });

  it("still says inside and above when those are true", () => {
    expect(reasons(500, 412.29, 615.99)).toContain("The $500 ask sits inside the $412.29 to $615.99 range.");
    expect(reasons(700, 412.29, 615.99)).toContain("The $700 ask is above the $412.29 to $615.99 range.");
  });

  it("raises no price flag for a small miss, so the sentence is the only thing said", () => {
    expect(reasons(410, 412.29, 615.99)).not.toMatch(/far below|stop/i);
  });
});
