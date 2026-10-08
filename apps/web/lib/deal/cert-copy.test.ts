import { fakeSlab, type CertCheck } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { certSentence } from "./cert-copy";

const record = fakeSlab.certRecord!;

describe("certSentence", () => {
  it("names the card's grade once and the record once on a mismatch", () => {
    const check: CertCheck = { record, matches: false, explanation: "x" };
    const { text, tone } = certSentence(check, "PSA 10");
    expect(text).toBe("Card says PSA 10. PSA (demo record) record says 2016 Pokemon XY Evolutions Charizard Holo #11, grade 7.");
    expect(tone).toBe("stop");
    expect(text.match(/PSA 10/g)).toHaveLength(1);
  });

  it("says the record agrees, with the grade once, on a match", () => {
    const check: CertCheck = { record: { ...record, provider: "psa", subject: "1999 Pokemon Game Charizard Holo #4", grade: "10" }, matches: true, explanation: "x" };
    const { text, tone } = certSentence(check, "PSA 10");
    expect(text).toBe("PSA record agrees: PSA 10");
    expect(tone).toBe("go");
  });

  it("says plainly when the grader has no record, and falls back to the explanation when nothing was compared", () => {
    expect(certSentence({ record: { ...record, subject: null, grade: null }, matches: false, explanation: "x" }, "PSA 10").text).toBe("Card says PSA 10. PSA (demo record) has no record for this cert number.");
    expect(certSentence({ record, matches: null, explanation: "The grader did not answer." }, "PSA 10")).toEqual({ text: "The grader did not answer.", tone: "muted" });
  });
});
