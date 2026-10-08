import { describe, expect, it } from "vitest";
import { plainCopy, sentences } from "./copy";

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
