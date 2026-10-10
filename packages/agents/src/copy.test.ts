import { describe, expect, it } from "vitest";
import { hashEndsItsSentence, paragraphs, plainCopy, sentences, stripMarkdown } from "./copy";

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
    expect(plainCopy("Gengar & Mimikyu GX #038 is the card.")).toBe("Gengar & Mimikyu GX #038 is the card.");
    expect(stripMarkdown("condition like_new")).toBe("condition like_new");
  });
});

describe("hashEndsItsSentence", () => {
  const hash = "9f".repeat(32);

  it("moves a hash out of the middle of its sentence so it ends the clause", () => {
    expect(hashEndsItsSentence(`A tamper check compared the deal history hash recorded on the PayPal order at payment time, ${hash}, against the 20 stored timeline events.`)).toBe(
      `A tamper check compared the deal history hash recorded on the PayPal order at payment time against the 20 stored timeline events: ${hash}.`,
    );
    expect(hashEndsItsSentence(`The hash ${hash} matches the stored events`)).toBe(`The hash matches the stored events: ${hash}.`);
  });

  it("leaves a hash that already ends its sentence alone, and every other text", () => {
    const ends = `Tamper check: the hash recorded at payment time is ${hash}. The 20 stored events reproduce it.`;
    expect(hashEndsItsSentence(ends)).toBe(ends);
    expect(hashEndsItsSentence("No hash in this one.")).toBe("No hash in this one.");
    expect(hashEndsItsSentence("Serial AJ164952580 is on the card.")).toBe("Serial AJ164952580 is on the card.");
  });

  it("works through plainCopy and keeps the paragraph breaks around it", () => {
    expect(plainCopy(`Paid in full.\n\nThe hash on the order, ${hash}, matches the 20 events.\n\nNothing else.`)).toBe(
      `Paid in full.\n\nThe hash on the order matches the 20 events: ${hash}.\n\nNothing else.`,
    );
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
