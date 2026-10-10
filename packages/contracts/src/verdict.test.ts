/**
 * Contracts v1.7.0: the pal's reasons are data, so they can be checked one
 * claim at a time. These tests pin the two properties the rest of the build
 * leans on: an old stored verdict without reasons still parses, and a new one
 * with them round-trips.
 */
import { describe, expect, it } from "vitest";
import { ArrivalCheckSchema, PalReasoningSchema, VerdictSchema } from "./verdict";

const reasoning = {
  checked: ["The serial on the back of the console, against the serial on the box label."],
  found: ["Both read AJ164952580."],
  couldNotVerify: ["Whether the seller is the owner. Nothing on a serial shows that."],
  wouldChangeMyMind: ["A photo of the console information screen with the same number on it."],
};

const verdict = {
  dealId: "d1",
  cardVersion: 1,
  overall: "go",
  flags: [],
  priceCheck: null,
  questionsForSeller: [],
  palMessage: "Looks fine to me.",
  createdAt: "2026-10-10T12:00:00.000Z",
};

describe("PalReasoning", () => {
  it("takes the four groups", () => {
    expect(PalReasoningSchema.parse(reasoning)).toEqual(reasoning);
  });

  it("allows a group to be empty but not absent, so a pal cannot omit what it could not verify", () => {
    expect(PalReasoningSchema.safeParse({ ...reasoning, couldNotVerify: [] }).success).toBe(true);
    const { couldNotVerify: _omitted, ...withoutIt } = reasoning;
    expect(PalReasoningSchema.safeParse(withoutIt).success).toBe(false);
  });
});

describe("the reasons are optional on both pal results", () => {
  it("parses a verdict stored before v1.7.0", () => {
    const parsed = VerdictSchema.parse(verdict);
    expect(parsed.reasoning).toBeUndefined();
  });

  it("round-trips a verdict that carries them", () => {
    expect(VerdictSchema.parse({ ...verdict, reasoning }).reasoning).toEqual(reasoning);
  });

  it("round-trips an arrival check that carries them", () => {
    const check = {
      dealId: "d1",
      cardVersion: 1,
      matches: true,
      mismatches: [],
      observed: { brand: "Sony", model: "CFI-1015A", serial: "AJ164952580" },
      palMessage: "That is the console on the card.",
      reasoning,
      createdAt: "2026-10-10T12:00:00.000Z",
    };
    expect(ArrivalCheckSchema.parse(check).reasoning).toEqual(reasoning);
  });
});
