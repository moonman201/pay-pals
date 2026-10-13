import { fakeSlab, type CertCheck } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { certHeadline, certSentence } from "./cert-copy";

const record = fakeSlab.certRecord!;

describe("certSentence", () => {
  it("names the card's grade once and the record once on a mismatch", () => {
    const check: CertCheck = { record, matches: false, explanation: "x" };
    const { text, tone } = certSentence(check, "PSA 10");
    expect(text).toBe(`Card says PSA 10. Demo PSA record says ${record.subject}, grade ${record.grade}.`);
    expect(tone).toBe("stop");
    expect(text.match(/PSA 10/g)).toHaveLength(1);
  });

  it("says the record agrees, with the grade once, on a match", () => {
    const check: CertCheck = { record: { ...record, provider: "psa", grade: "10" }, matches: true, explanation: "x" };
    const { text, tone } = certSentence(check, "PSA 10");
    expect(text).toBe("PSA record agrees: PSA 10");
    expect(tone).toBe("go");
  });

  it("says plainly when the grader has no record, and falls back to the explanation when nothing was compared", () => {
    expect(certSentence({ record: { ...record, subject: null, grade: null }, matches: false, explanation: "x" }, "PSA 10").text).toBe("Card says PSA 10. Demo PSA has no record for this cert number.");
    expect(certSentence({ record, matches: null, explanation: "The grader did not answer." }, "PSA 10")).toEqual({ text: "The grader did not answer.", tone: "muted" });
  });
});

describe("certHeadline", () => {
  it("makes the demo record plain, without a possessive on a bracket", () => {
    const text = certHeadline({ record: { ...record, provider: "fixture" }, matches: true, explanation: "x" });
    expect(text).toBe(`Cert ${record.certNumber} matches the demo PSA record. The slab exists. That doesn't prove the seller has it.`);
    expect(text).not.toMatch(/\(demo record\)/);
  });

  it("names PSA's own record when the record is PSA's", () => {
    expect(certHeadline({ record: { ...record, provider: "psa" }, matches: true, explanation: "x" })).toMatch(/matches PSA's record\./);
  });
});
