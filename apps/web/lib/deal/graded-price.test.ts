import { cleanPs5, fakeSlab } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { GRADED_PRICE_LINK_LEAD, GRADED_PRICE_NOTE, graded130pointSearchUrl, gradedPriceLinks, gradedPriceSearchUrl, isGradedCard } from "./graded-price";

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
    expect(GRADED_PRICE_LINK_LEAD).toBe("Check recent sold prices on");
    expect(gradedPriceLinks(slab).map((l) => l.name)).toEqual(["PriceCharting", "130point"]);
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

describe("the grade in the search", () => {
  it("is added once, and not again when the title already carries it", () => {
    const plain = { ...slab, title: "Gengar 1999", grade: "PSA 10" };
    expect(decodeURIComponent(gradedPriceSearchUrl(plain))).toContain("q=Gengar 1999 PSA 10&");
    const carried = { ...slab, title: "Gengar 1999 PSA 10", grade: "PSA 10" };
    for (const url of [gradedPriceSearchUrl(carried), graded130pointSearchUrl(carried)]) {
      expect(decodeURIComponent(url)).toContain("Gengar 1999 PSA 10");
      expect(decodeURIComponent(url)).not.toMatch(/PSA 10 PSA 10/i);
    }
  });
});
