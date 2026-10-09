import { fakeSlab } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { certRows } from "./cert-compare";

const record = fakeSlab.certRecord!;

describe("certRows", () => {
  it("puts the card on the left and the grader's record on the right, mismatched rows marked", () => {
    // A card from a different year, with a different grade on it: every row the record covers should differ.
    const otherYear = String(Number(record.year) - 3);
    const rows = certRows({ record, matches: false, explanation: "x" }, `${otherYear} A different card, PSA 10`, "PSA 10");
    expect(rows.map((r) => [r.label, r.status])).toEqual([
      ["Item", "mismatch"],
      ["Grade", "mismatch"],
      ["Year", "mismatch"],
      ["Cert", "match"],
    ]);
    expect(rows[0]!.right).toBe(record.subject);
    expect(rows[1]!.left).toBe("PSA 10");
    expect(rows[1]!.right).toBe(record.grade);
    expect(rows[2]!.left).toBe(otherYear);
    expect(rows[2]!.right).toBe(record.year);
  });

  it("reads the grade from the title when the card has no grade field", () => {
    const rows = certRows({ record, matches: false, explanation: "x" }, "A graded card, PSA 10", null);
    expect(rows[1]!.left).toBe("PSA 10");
  });

  it("says there is no record when the grader has none, with every row a mismatch", () => {
    const rows = certRows({ record: { ...record, subject: null, grade: null, year: null }, matches: false, explanation: "x" }, "Some card", "PSA 9");
    expect(rows.every((r) => r.status === "mismatch")).toBe(true);
    expect(rows[0]!.right).toBe("no record for this cert number");
  });

  it("marks every row a match when the pal says the record agrees, and unknown when it could not compare", () => {
    expect(certRows({ record, matches: true, explanation: "x" }, "t", "7").every((r) => r.status === "match")).toBe(true);
    expect(certRows({ record, matches: null, explanation: "x" }, "t", "7").every((r) => r.status === "unknown")).toBe(true);
  });
});
