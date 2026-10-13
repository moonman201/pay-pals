import type { ArrivalCheck, Deal, Verdict } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { cleanPathInput, type PathReader } from "./clean-path";

const verdict = (overall: Verdict["overall"], createdAt: string) => ({ overall, createdAt }) as Verdict;

function reader(over: Partial<PathReader> = {}): PathReader {
  return {
    getDeal: async () => ({ state: "COMPLETE" }) as Deal,
    listVerdicts: async () => [verdict("go", "2026-10-10T10:00:00.000Z"), verdict("caution", "2026-10-10T09:00:00.000Z")],
    getArrivalCheck: async () => ({ outcome: "match" }) as ArrivalCheck,
    ...over,
  };
}

describe("cleanPathInput", () => {
  it("reads the seeded deal: verdicts in time order, its state, its arrival outcome", async () => {
    expect(await cleanPathInput(reader(), "d1")).toEqual({ overalls: ["caution", "go"], state: "COMPLETE", arrival: "match" });
  });

  it("follows the deal when it differs from the fixture", async () => {
    const input = await cleanPathInput(reader({ getDeal: async () => ({ state: "PAID" }) as Deal, getArrivalCheck: async () => null }), "d1");
    expect(input).toEqual({ overalls: ["caution", "go"], state: "PAID", arrival: null });
  });

  it("falls back to the fixture story with no seeded deal, a missing deal, or a store that throws", async () => {
    const story = { overalls: ["caution", "go"], state: "COMPLETE", arrival: "match" };
    expect(await cleanPathInput(reader(), undefined)).toEqual(story);
    expect(await cleanPathInput(reader({ getDeal: async () => null }), "gone")).toEqual(story);
    expect(await cleanPathInput(reader({ listVerdicts: async () => Promise.reject(new Error("down")) }), "d1")).toEqual(story);
  });
});
