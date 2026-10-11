import { cleanPs5, fakeSlab } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { GRADED_PRICE_LINK_TEXT, GRADED_PRICE_NOTE, gradedPriceSearchUrl, isGradedCard } from "./graded-price";

const slab = fakeSlab.cards[fakeSlab.cards.length - 1]!;
const console_ = cleanPs5.cards[cleanPs5.cards.length - 1]!;

describe("isGradedCard", () => {
  it("is a cert number and nothing else, the same test the cert comparison uses", () => {
    expect(isGradedCard(slab)).toBe(true);
    expect(isGradedCard(console_)).toBe(false);
    expect(isGradedCard({ ...slab, certNumber: null })).toBe(false);
    expect(isGradedCard(null)).toBe(false);
    expect(isGradedCard(undefined)).toBe(false);
  });
});

describe("the graded-card price note", () => {
  it("says it cannot check, and why, without naming a number", () => {
    expect(GRADED_PRICE_NOTE).toBe("Price: can't check automatically. Channel3 covers retail stores, not graded cards.");
    // No money anywhere in it. The 3 in Channel3 is a product name, not a figure.
    expect(GRADED_PRICE_NOTE).not.toMatch(/\$|\b\d[\d,.]*\b/);
    expect(GRADED_PRICE_NOTE).not.toContain("—");
  });

  it("sends the reader to the two places that do track graded sales", () => {
    expect(GRADED_PRICE_LINK_TEXT).toBe("Check recent sold prices on PriceCharting or 130point");
  });
});

describe("gradedPriceSearchUrl", () => {
  it("searches for what the card says it is, with the grade, because a PSA 9 is a different price", () => {
    const url = gradedPriceSearchUrl(slab);
    expect(url.startsWith("https://www.pricecharting.com/search-products?q=")).toBe(true);
    expect(decodeURIComponent(url)).toContain(slab.title);
    if (slab.grade) expect(decodeURIComponent(url)).toContain(slab.grade);
  });

  it("leaves the cert number out, because it names one slab and would return nothing", () => {
    expect(decodeURIComponent(gradedPriceSearchUrl(slab))).not.toContain(slab.certNumber!);
  });

  it("escapes a title that would otherwise break the query", () => {
    const url = gradedPriceSearchUrl({ ...slab, title: "Gengar & Mimikyu GX #038", grade: null });
    expect(url).toContain("%26");
    expect(url).not.toContain("&q=Gengar &");
  });
});
