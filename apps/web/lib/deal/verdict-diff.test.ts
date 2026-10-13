import { cleanPs5, type RedFlag, type Verdict } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { diffVerdicts, lastTwoVerdicts } from "./verdict-diff";

function flag(code: RedFlag["code"], severity: RedFlag["severity"] = "caution"): RedFlag {
  return { code, severity, evidence: "something the seller wrote", explanation: "One plain sentence.", raisedByRule: true };
}

function verdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    dealId: "d",
    cardVersion: 1,
    overall: "caution",
    flags: [],
    priceCheck: cleanPs5.marketPrice,
    questionsForSeller: [],
    palMessage: "Have a look.",
    createdAt: "2026-10-09T10:00:00.000Z",
    ...overrides,
  };
}

describe("lastTwoVerdicts", () => {
  it("has nothing to compare with fewer than two reviews", () => {
    expect(lastTwoVerdicts([])).toBeNull();
    expect(lastTwoVerdicts([verdict()])).toBeNull();
  });

  it("takes the last two, oldest first", () => {
    const a = verdict({ cardVersion: 1 });
    const b = verdict({ cardVersion: 2 });
    const c = verdict({ cardVersion: 3 });
    expect(lastTwoVerdicts([a, b, c])).toEqual({ previous: b, current: c });
  });
});

describe("diffVerdicts", () => {
  it("is the clean-ps5 case: the close-up photo clears the missing serial and the verdict goes to Go", () => {
    const before = verdict({ cardVersion: 1, overall: "caution", flags: [flag("MISSING_SERIAL")], questionsForSeller: ["Can you send a close-up of the serial label on the console itself?"] });
    const after = verdict({ cardVersion: 2, overall: "go", flags: [], createdAt: "2026-10-09T11:00:00.000Z" });
    const diff = diffVerdicts(before, after);
    expect(diff.cleared.map((f) => f.code)).toEqual(["MISSING_SERIAL"]);
    expect(diff.appeared).toEqual([]);
    expect(diff.stayed).toEqual([]);
    expect(diff.overallChanged).toBe(true);
    expect(diff.lines[0]).toBe("The verdict went from Caution to Looks good.");
    expect(diff.lines).toContain("The new review was made against card version 2, the earlier one against version 1.");
    expect(diff.lines).toContain("Cleared: no serial number.");
    expect(diff.lines).toContain("1 question the pal asked before is no longer open.");
  });

  it("separates the flags that cleared, appeared and stayed", () => {
    const before = verdict({ flags: [flag("MISSING_SERIAL"), flag("URGENCY_PRESSURE")] });
    const after = verdict({ flags: [flag("URGENCY_PRESSURE"), flag("STOCK_OR_REUSED_PHOTO", "stop")] });
    const diff = diffVerdicts(before, after);
    expect(diff.cleared.map((f) => f.code)).toEqual(["MISSING_SERIAL"]);
    expect(diff.appeared.map((f) => f.code)).toEqual(["STOCK_OR_REUSED_PHOTO"]);
    expect(diff.stayed.map((f) => f.code)).toEqual(["URGENCY_PRESSURE"]);
    expect(diff.lines).toContain("Cleared: no serial number.");
    expect(diff.lines).toContain("New: a reused listing photo.");
    expect(diff.unchangedLine).toBe("Still there: pressure to pay now.");
  });

  it("joins two or more flag names plainly", () => {
    const before = verdict({ flags: [flag("MISSING_SERIAL"), flag("URGENCY_PRESSURE"), flag("NAME_MISMATCH")] });
    const diff = diffVerdicts(before, verdict());
    expect(diff.lines).toContain("Cleared: no serial number, pressure to pay now and a PayPal account that does not match the seller.");
  });

  it("says nothing changed when the second review found the same things", () => {
    const same = verdict({ flags: [flag("URGENCY_PRESSURE")] });
    const diff = diffVerdicts(same, { ...same, createdAt: "2026-10-09T12:00:00.000Z" });
    expect(diff.lines).toEqual([]);
    expect(diff.unchangedLine).toBe("Still there: pressure to pay now.");
  });

  it("names a new question for the seller", () => {
    const diff = diffVerdicts(verdict(), verdict({ questionsForSeller: ["What is the battery health?"] }));
    expect(diff.lines).toContain("1 new question for the seller.");
  });

  it("reports a price check that changed, and never a zero range", () => {
    const zero = { marketLow: 0, marketHigh: 0, currency: "USD" as const, provider: "channel3" as const, sources: [], checkedAt: "2026-10-09T00:00:00.000Z" };
    const diff = diffVerdicts(verdict(), verdict({ priceCheck: zero }));
    expect(diff.lines.some((l) => l.includes("No reliable market price found"))).toBe(true);
    expect(diff.lines.join(" ")).not.toContain("$0 to $0");
  });

  it("reports a cert check that changed, and says not checked rather than inventing a result", () => {
    const record = {
      provider: "fixture" as const,
      certNumber: "12345678",
      subject: "A card",
      grade: "GEM MT 10",
      year: "2018",
      brand: "P.M.",
      raw: null,
      checkedAt: "2026-10-09T00:00:00.000Z",
    };
    const before = verdict({ certCheck: { record, matches: null, explanation: "Nothing to compare." } });
    const after = verdict({ certCheck: { record, matches: false, explanation: "The record describes a different card." } });
    expect(diffVerdicts(before, after).lines).toContain("The cert check went from was not checked to did not match the card.");
  });

  it("says which open question the new evidence closed, and which it opened", () => {
    const reasoning = (couldNotVerify: string[]) => ({ checked: [], found: [], couldNotVerify, wouldChangeMyMind: [] });
    const before = verdict({ cardVersion: 1, reasoning: reasoning(["Whether the console serial matches the box."]) });
    const after = verdict({ cardVersion: 2, reasoning: reasoning(["Whether the console powers on."]) });
    const diff = diffVerdicts(before, after);
    expect(diff.lines).toContain("Now checked: whether the console serial matches the box.");
    expect(diff.lines).toContain("The pal could not check this on the new version: Whether the console powers on.");
  });

  it("never presents a failure statement as the thing now checked", () => {
    const reasoning = (couldNotVerify: string[]) => ({ checked: [], found: [], couldNotVerify, wouldChangeMyMind: [] });
    const before = verdict({ cardVersion: 1, reasoning: reasoning(["A serial is in one photo but I could not read it."]) });
    const after = verdict({ cardVersion: 2, reasoning: reasoning([]) });
    const lines = diffVerdicts(before, after).lines;
    expect(lines).toContain('Now checked: what was open before, "A serial is in one photo but I could not read it".');
    expect(lines.join(" ")).not.toMatch(/Now checked: a serial/i);
  });

  it("lists only what left the could-not-check list, and agrees with the count of questions", () => {
    const reasoning = (couldNotVerify: string[]) => ({ checked: [], found: [], couldNotVerify, wouldChangeMyMind: [] });
    const before = verdict({ cardVersion: 1, questionsForSeller: ["a?", "b?"], reasoning: reasoning(["Whether it powers on.", "Whether it is sealed."]) });
    const after = verdict({ cardVersion: 2, questionsForSeller: [], reasoning: reasoning(["Whether it is sealed."]) });
    const lines = diffVerdicts(before, after).lines;
    expect(lines).toContain("2 questions the pal asked before are no longer open.");
    expect(lines.filter((l) => l.startsWith("Now checked"))).toEqual(["Now checked: whether it powers on."]);
  });

  it("says nothing about reasons a verdict never carried", () => {
    const diff = diffVerdicts(verdict(), verdict({ cardVersion: 2 }));
    expect(diff.lines.some((l) => l.includes("could not check"))).toBe(false);
  });

  it("writes no em dashes and never claims the item is authentic", () => {
    const before = verdict({ flags: [flag("CERT_MISMATCH", "stop")], overall: "stop" });
    const after = verdict({ overall: "go" });
    for (const line of diffVerdicts(before, after).lines) {
      expect(line).not.toContain("—");
      expect(line.toLowerCase()).not.toContain("authentic");
      expect(line.toLowerCase()).not.toContain("verified");
    }
  });
});
