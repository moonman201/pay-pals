import { describe, expect, it } from "vitest";
import type { CertRecord } from "@pay-pals/contracts";
import { FAKE_SLAB_CERT, fakeSlab } from "@pay-pals/contracts";
import { compareCertRecord, gradeNumber, subjectTokens } from "./compare";

const card = fakeSlab.cards[0]!;
const now = new Date().toISOString();
const psaRecord = (overrides: Partial<CertRecord>): CertRecord => ({
  provider: "psa",
  certNumber: FAKE_SLAB_CERT,
  subject: "1999 POKEMON GAME CHARIZARD-HOLO #4",
  grade: "GEM MT 10",
  year: "1999",
  brand: "POKEMON GAME",
  raw: null,
  checkedAt: now,
  ...overrides,
});

describe("gradeNumber", () => {
  it("reads the grade digits from slab labels and PSA grades", () => {
    expect(gradeNumber("PSA 10")).toBe("10");
    expect(gradeNumber("GEM MT 10")).toBe("10");
    expect(gradeNumber("7")).toBe("7");
    expect(gradeNumber("NM-MT 8.5")).toBe("8.5");
    expect(gradeNumber("Authentic")).toBeNull();
    expect(gradeNumber(null)).toBeNull();
  });
});

describe("subjectTokens", () => {
  it("keeps set, character, year and card number but drops grade words", () => {
    expect([...subjectTokens("1999 Pokemon Base Set Charizard Holo, PSA 10 #4", "PSA 10")].sort()).toEqual(["1999", "4", "base", "charizard", "holo", "pokemon", "set"]);
  });
});

describe("compareCertRecord", () => {
  it("fake-slab: a different card and grade is a mismatch", () => {
    const result = compareCertRecord(card, fakeSlab.certRecord!);
    expect(result.matches).toBe(false);
    expect(result.explanation).toContain("2016 Pokemon XY Evolutions Charizard Holo #11");
    expect(result.explanation).toContain("grade 7, not 10");
    expect(result.evidence).toContain(`certNumber: ${FAKE_SLAB_CERT}`);
    expect(result.evidence).toContain(card.title);
    expect(result.overlap).toBeLessThan(0.6);
  });

  it("a missing record is a mismatch", () => {
    const result = compareCertRecord(card, psaRecord({ subject: null, grade: null, year: null, brand: null }));
    expect(result.matches).toBe(false);
    expect(result.explanation).toBe(`PSA has no record for cert ${FAKE_SLAB_CERT}, so the slab label cannot be trusted.`);
    expect(result.evidence).toContain("PSA record: none");
  });

  it("a PSA record for the same card and grade matches, in PSA's own spelling", () => {
    const result = compareCertRecord(card, psaRecord({}));
    expect(result.matches).toBe(true);
    expect(result.explanation).toBe(`PSA confirms cert ${FAKE_SLAB_CERT}: 1999 POKEMON GAME CHARIZARD-HOLO #4, grade GEM MT 10.`);
    expect(result.overlap).toBeGreaterThanOrEqual(0.6);
  });

  it("the right card at the wrong grade is a mismatch, and so is the wrong year", () => {
    expect(compareCertRecord(card, psaRecord({ grade: "MINT 9" })).matches).toBe(false);
    expect(compareCertRecord(card, psaRecord({ grade: "MINT 9" })).explanation).toContain("grade 9, not 10");
    expect(compareCertRecord(card, psaRecord({ year: "2000", subject: "2000 POKEMON GAME CHARIZARD-HOLO #4" })).matches).toBe(false);
  });

  it("does not compare grades when the card has none", () => {
    expect(compareCertRecord({ ...card, grade: null }, psaRecord({ grade: "MINT 9" })).matches).toBe(true);
  });
});
