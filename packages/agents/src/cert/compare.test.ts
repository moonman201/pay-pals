import { describe, expect, it } from "vitest";
import type { CertRecord } from "@pay-pals/contracts";
import { FAKE_SLAB_CERT, fakeSlab } from "@pay-pals/contracts";
import { NOT_CHECKED_EXPLANATION, compareCertRecord, gradeNumber, subjectTokens } from "./compare";

const card = fakeSlab.cards[0]!;
const now = new Date().toISOString();

/** PSA's own spelling of the card on the slab, as the fixture record has it. */
const psaRecord = (overrides: Partial<CertRecord> = {}): CertRecord => ({
  provider: "psa",
  certNumber: FAKE_SLAB_CERT,
  subject: "2018 P.M. JPN. SUN & MOON GENGAR & MIMIKYU GX TAG BOLT #038",
  grade: "GEM MT 10",
  year: "2018",
  brand: "P.M. JPN. SUN & MOON",
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
    expect([...subjectTokens("2018 Pokemon Sun & Moon Gengar & Mimikyu GX #038, PSA 10", "PSA 10")].sort()).toEqual([
      "038",
      "2018",
      "gengar",
      "gx",
      "mimikyu",
      "moon",
      "pokemon",
      "sun",
    ]);
  });
});

describe("compareCertRecord", () => {
  it("fake-slab: the record matches the card, and says what that does and does not show", () => {
    const result = compareCertRecord(card, fakeSlab.certRecord!);
    expect(result.matches).toBe(true);
    expect(result.explanation).toBe(
      `PSA (demo record) has a record for cert ${FAKE_SLAB_CERT} that matches this card (2018 P.M. JPN. SUN & MOON GENGAR & MIMIKYU GX TAG BOLT #038, grade GEM MT 10). That shows the slab exists, not that this seller is holding it.`,
    );
    expect(result.explanation.length).toBeLessThanOrEqual(300);
    expect(result.explanation).not.toMatch(/verif|authentic|confirms/i);
    expect(result.evidence).toContain(`Cert ${FAKE_SLAB_CERT} on the card`);
    expect(result.overlap).toBeGreaterThanOrEqual(0.6);
  });

  it("a record for a different card and grade is a mismatch", () => {
    const result = compareCertRecord(card, psaRecord({ subject: "2019 P.M. JPN. SUN & MOON PIKACHU & ZEKROM GX #054", grade: "7", year: "2019", brand: "Pokemon" }));
    expect(result.matches).toBe(false);
    expect(result.explanation).toContain("2019 P.M. JPN. SUN & MOON PIKACHU & ZEKROM GX #054");
    expect(result.explanation).toContain("grade 7, not 10");
    expect(result.overlap).toBeLessThan(0.6);
  });

  it("a real PSA not-found is a mismatch", () => {
    const result = compareCertRecord(card, psaRecord({ subject: null, grade: null, year: null, brand: null }));
    expect(result.matches).toBe(false);
    expect(result.explanation).toBe(`PSA has no record for cert ${FAKE_SLAB_CERT}, so the slab label cannot be trusted.`);
    expect(result.evidence).toContain("PSA has no record of it");
  });

  it("a cert nobody looked up compares to null with the not-checked sentence, never a mismatch", () => {
    const unknown = { ...psaRecord({ subject: null, grade: null, year: null, brand: null }), provider: "fixture" as const, certNumber: "49172834", raw: { notChecked: true } };
    const result = compareCertRecord({ ...card, certNumber: "49172834" }, unknown);
    expect(result.matches).toBeNull();
    expect(result.explanation).toBe(NOT_CHECKED_EXPLANATION);
    expect(result.explanation).toBe("The cert number was not checked against PSA (no PSA access on this server).");
    expect(result.evidence).toContain("not checked");
    expect(compareCertRecord({ ...card, certNumber: "49172834" }, { ...unknown, raw: null }).matches).toBeNull();
  });

  it("the right card at the wrong grade is a mismatch, and so is the wrong year", () => {
    expect(compareCertRecord(card, psaRecord({ grade: "MINT 9" })).matches).toBe(false);
    expect(compareCertRecord(card, psaRecord({ grade: "MINT 9" })).explanation).toContain("grade 9, not 10");
    expect(compareCertRecord(card, psaRecord({ year: "2019", subject: "2019 P.M. JPN. SUN & MOON GENGAR & MIMIKYU GX TAG BOLT #038" })).matches).toBe(false);
  });

  it("does not compare grades when the card has none", () => {
    expect(compareCertRecord({ ...card, grade: null }, psaRecord({ grade: "MINT 9" })).matches).toBe(true);
  });
});
