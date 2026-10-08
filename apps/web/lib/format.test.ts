import { describe, expect, it } from "vitest";
import { endSentence, formatTime, nameInSentence } from "./format";

describe("name punctuation", () => {
  it("strips a trailing period from a name so a sentence ends with one stop", () => {
    expect(nameInSentence("Dana M.")).toBe("Dana M");
    expect(nameInSentence("Dana")).toBe("Dana");
    expect(endSentence("You are the buyer, Dana M.")).toBe("You are the buyer, Dana M.");
    expect(endSentence("You are the buyer, Dana")).toBe("You are the buyer, Dana.");
    expect(endSentence("Hi Matt M.")).toBe("Hi Matt M.");
  });
});

describe("formatTime", () => {
  it("renders a fixed UTC form", () => {
    expect(formatTime("2026-10-21T16:00:00.000Z")).toBe("2026-10-21 16:00 UTC");
  });
});
