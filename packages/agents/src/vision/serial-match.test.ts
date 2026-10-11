/**
 * The near-miss band. The three faults it exists for are the ones seen on
 * clean-ps5/box-label.jpg across 2026-10-10, whose true serial is
 * AJ164952580: a trailing 0 read as O, the same glyph read as Q, and the 4 at
 * position 5 dropped.
 */
import { describe, expect, it } from "vitest";
import { CLEAN_SERIAL, cleanPs5 } from "@pay-pals/contracts";
import { boxSerialMismatchRule } from "../rules/box-serial-mismatch";
import { compareSerials, describeDifference, MIN_BANDED_LENGTH, withinOneEdit } from "./serial-match";

describe("withinOneEdit", () => {
  it.each([
    ["AJ164952580", "AJ164952580", true, "identical"],
    ["AJ164952580", "AJ16495258O", true, "one substitution at the end"],
    ["AJ164952580", "AJ16495258Q", true, "the same glyph read differently"],
    ["AJ164952580", "AJ16952580", true, "one character dropped from the middle"],
    ["AJ16952580", "AJ164952580", true, "the same, argued the other way round"],
    ["AJ164952580", "AJ1649525800", true, "one character added at the end"],
    ["AJ164952580", "AJ100000001", false, "a different unit"],
    ["AJ164952580", "AJ16495258", true, "the trailing character dropped"],
    ["AJ164952580", "AJ1649525", false, "two characters short"],
    ["AJ164952580", "AJ16495258OQ", false, "one dropped and one added"],
    ["ABCDEF", "BCDEFA", false, "a rotation, which is many edits"],
  ])("%s vs %s is %s (%s)", (a, b, expected) => {
    expect(withinOneEdit(a, b)).toBe(expected);
    expect(withinOneEdit(b, a)).toBe(expected);
  });
});

describe("compareSerials", () => {
  const read = { readFromPhoto: true };
  const typed = { readFromPhoto: false };

  it("matches regardless of case and punctuation, with or without a photo", () => {
    expect(compareSerials("aj-164 952580", CLEAN_SERIAL, typed)).toBe("match");
    expect(compareSerials(CLEAN_SERIAL, CLEAN_SERIAL, read)).toBe("match");
  });

  it.each([
    ["AJ16495258O", "the trailing 0 read as O"],
    ["AJ16495258Q", "the trailing 0 read as Q"],
    ["AJ16952580", "the 4 dropped"],
  ])("calls %s near when a photo read is in play (%s)", (misread) => {
    expect(compareSerials(CLEAN_SERIAL, misread, read)).toBe("near");
  });

  it("calls the same difference a mismatch when nothing was read off a photo", () => {
    // Two numbers a person typed that differ by one character differ for some other reason.
    expect(compareSerials(CLEAN_SERIAL, "AJ16495258O", typed)).toBe("different");
  });

  it("never bands a short identifier, where one edit is a large part of the string", () => {
    const short = "AB12345";
    expect(short.length).toBeLessThan(MIN_BANDED_LENGTH);
    expect(compareSerials(short, "AB12346", read)).toBe("different");
  });

  it("still calls a genuinely different serial a mismatch", () => {
    expect(compareSerials(CLEAN_SERIAL, "AJ100000001", read)).toBe("different");
  });
});

describe("describeDifference", () => {
  it("names the character and the position for a substitution", () => {
    expect(describeDifference(CLEAN_SERIAL, "AJ16495258O")).toBe("they differ only at character 11, 0 against O");
  });

  it("names the missing character for a deletion", () => {
    // AJ164952580 against AJ16952580: the 4 at position 5 is the one that went missing.
    expect(describeDifference(CLEAN_SERIAL, "AJ16952580")).toBe("one of them is missing the character at position 5, 4");
  });
});

describe("the box serial rule", () => {
  const card = { ...cleanPs5.cards[1]!, serial: CLEAN_SERIAL };
  const run = (boxSerial: string, serialReadFromPhoto: boolean) =>
    boxSerialMismatchRule({ card: { ...card, boxSerial }, chat: [], priceCheck: null, serialReadFromPhoto });

  it("raises nothing when the two agree", () => {
    expect(run(CLEAN_SERIAL, true)).toEqual([]);
  });

  it("raises nothing on a one-character difference when a photo read is in play", () => {
    // This is the whole point: the clean deal must not come back caution on a misread.
    expect(run("AJ16495258O", true)).toEqual([]);
    expect(run("AJ16952580", true)).toEqual([]);
  });

  it("still raises caution on a genuinely different number", () => {
    const flags = run("AJ100000001", true);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ code: "OTHER", severity: "caution", raisedByRule: true });
    expect(flags[0]!.evidence).toContain("AJ100000001");
  });

  it("still raises caution on a one-character difference when no photo was read", () => {
    const flags = run("AJ16495258O", false);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.code).toBe("OTHER");
  });

  it("raises nothing when the card carries only one of the two numbers", () => {
    expect(boxSerialMismatchRule({ card: { ...card, serial: null }, chat: [], priceCheck: null, serialReadFromPhoto: true })).toEqual([]);
    expect(boxSerialMismatchRule({ card: { ...card, boxSerial: null }, chat: [], priceCheck: null, serialReadFromPhoto: true })).toEqual([]);
  });
});
