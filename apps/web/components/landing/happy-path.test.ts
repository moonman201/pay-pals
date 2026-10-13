import { cleanPs5 } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { happyPath, inputFromFixture } from "./happy-path";

const labels = (input: Parameters<typeof happyPath>[0]) => happyPath(input).map((s) => s.label);

describe("happyPath", () => {
  it("reads the clean fixture as Caution, Looks good, Paid, Shipped, Matched", () => {
    expect(labels(inputFromFixture(cleanPs5))).toEqual(["Caution", "Looks good", "Paid", "Shipped", "Matched"]);
  });

  it("follows the deal, so a deal that stopped early shows only what happened", () => {
    expect(labels({ overalls: ["caution", "go"], state: "PAID", arrival: null })).toEqual(["Caution", "Looks good", "Paid"]);
    expect(labels({ overalls: ["go"], state: "SHIPPED", arrival: null })).toEqual(["Looks good", "Paid", "Shipped"]);
    expect(labels({ overalls: ["stop"], state: "BLOCKED", arrival: null })).toEqual(["Stop"]);
  });

  it("does not say Matched for a mismatch or an unsettled arrival", () => {
    expect(labels({ overalls: ["go"], state: "ISSUE", arrival: "mismatch" })).toEqual(["Looks good"]);
    expect(labels({ overalls: ["go"], state: "DELIVERED", arrival: "inconclusive" })).toEqual(["Looks good", "Paid", "Shipped"]);
  });
});
