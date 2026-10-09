import { describe, expect, it } from "vitest";
import { paragraphs, plainCopy, sentences, stripMarkdown } from "./copy";

describe("plainCopy", () => {
  it("removes em dashes and exclamation marks", () => {
    expect(plainCopy("Great deal — pay now!")).toBe("Great deal, pay now.");
  });
  it("cuts a long message at the last full sentence, never mid-word", () => {
    const sentence = "This sentence has exactly forty characters.";
    const long = Array.from({ length: 30 }, () => sentence).join(" ");
    const cut = plainCopy(long);
    expect(cut.length).toBeLessThanOrEqual(900);
    expect(cut.endsWith("forty characters.")).toBe(true);
    expect(cut).not.toMatch(/characte\.$/);
  });
  it("falls back to a word boundary when there is no sentence end to cut at", () => {
    const long = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
    const cut = plainCopy(long, 100);
    expect(cut.length).toBeLessThanOrEqual(101);
    expect(cut).toMatch(/word\d+\.$/);
  });
  it("joins parts and drops empties", () => {
    expect(sentences("One.", null, "", undefined, false, "Two.")).toBe("One. Two.");
  });
});

describe("stripMarkdown", () => {
  it("strips the markers a model reaches for", () => {
    expect(plainCopy("**Summary**")).toBe("Summary");
    expect(plainCopy("The *price* is `420` dollars.")).toBe("The price is 420 dollars.");
    expect(plainCopy("## Shipping\nIt shipped.")).toBe("Shipping\nIt shipped.");
    expect(plainCopy("- First point\n- Second point")).toBe("First point\nSecond point");
    expect(plainCopy("* Starred bullet")).toBe("Starred bullet");
    expect(plainCopy("1. First\n2) Second")).toBe("First\nSecond");
    expect(plainCopy("> Quoted line")).toBe("Quoted line");
    expect(plainCopy("```json\n{}\n```")).toBe("{}");
    expect(plainCopy("__bold__ text")).toBe("bold text");
  });
  it("leaves a card number and a single underscore alone", () => {
    expect(plainCopy("Charizard Holo #4 is the card.")).toBe("Charizard Holo #4 is the card.");
    expect(stripMarkdown("condition like_new")).toBe("condition like_new");
  });
});

describe("paragraphs", () => {
  it("keeps one blank line between groups and drops empty groups", () => {
    const text = paragraphs([["Deal line."], [null, "Card line.", false], [], ["Payment line.", "Capture line."]]);
    expect(text).toBe("Deal line.\n\nCard line.\n\nPayment line. Capture line.");
  });
  it("survives plainCopy: blank lines are kept, runs of three or more collapse to one", () => {
    expect(plainCopy("One.\n\nTwo.")).toBe("One.\n\nTwo.");
    expect(plainCopy("One.  \n\n\n\nTwo.")).toBe("One.\n\nTwo.");
    expect(plainCopy("One.\nTwo.")).toBe("One.\nTwo.");
  });
});
