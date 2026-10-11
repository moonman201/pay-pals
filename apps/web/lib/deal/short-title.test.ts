import { cleanPs5, emptyBox, fakeSlab } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { shortTitle } from "./short-title";

const slab = fakeSlab.cards[0]!;

describe("shortTitle", () => {
  it("shortens the slab deal to what tells one listing from another", () => {
    // Matt's example, from the room he reviewed line by line.
    expect(slab.title).toBe("2018 Pokemon Japanese Sun & Moon Tag Bolt Gengar & Mimikyu GX #038, PSA 10");
    expect(shortTitle(slab)).toBe("Gengar & Mimikyu GX, PSA 10");
  });

  it("keeps the grade, because a PSA 10 and a PSA 9 are different items", () => {
    expect(shortTitle({ ...slab, grade: "PSA 9" })).toBe("Gengar & Mimikyu GX, PSA 9");
  });

  it("drops the card number, which names no item on its own", () => {
    expect(shortTitle(slab)).not.toContain("038");
  });

  it("leaves everything that is not a graded card exactly as it was", () => {
    // A console's model is "PlayStation 5 disc edition, CFI-1015A", whose last part
    // is a model number. Guessing there would put "CFI-1015A" at the top of the page.
    for (const card of [...cleanPs5.cards, ...emptyBox.cards]) {
      expect(card.certNumber).toBeFalsy();
      expect(shortTitle(card)).toBe(card.title);
    }
  });

  it("keeps the full title when the model has no catalogue shape to read", () => {
    expect(shortTitle({ ...slab, model: "Gengar & Mimikyu GX" })).toBe(slab.title);
    expect(shortTitle({ ...slab, model: "" })).toBe(slab.title);
    expect(shortTitle({ ...slab, model: "038/095" })).toBe(slab.title);
  });

  it("never returns something longer than what it was given", () => {
    for (const fixture of [cleanPs5, fakeSlab, emptyBox]) {
      for (const card of fixture.cards) expect(shortTitle(card).length, card.title).toBeLessThanOrEqual(card.title.length);
    }
  });

  it("names the deal when there is no card yet", () => {
    expect(shortTitle(null)).toBe("New deal");
    expect(shortTitle(undefined)).toBe("New deal");
    expect(shortTitle({ ...slab, title: "   " })).toBe("New deal");
  });

  it("leaves no stray punctuation where it cut", () => {
    expect(shortTitle(slab)).not.toMatch(/^[\s,:-]|[\s,]$|\s{2,}|\s,/);
    expect(shortTitle({ ...slab, grade: null })).toBe("Gengar & Mimikyu GX");
  });
});
