import { describe, expect, it } from "vitest";
import { visibleEvidence } from "./flag-evidence";

describe("visibleEvidence", () => {
  it("keeps the rule's own quote", () => {
    expect(visibleEvidence('Seller wrote: "Friends and Family only."')).toBe('Seller wrote: "Friends and Family only."');
    expect(visibleEvidence("  checklist: Photo of the console: not done  ")).toBe("checklist: Photo of the console: not done");
  });

  it("drops a photo-handling artifact, whatever its case", () => {
    expect(visibleEvidence("Photo block 2 of 4 could not be read")).toBeNull();
    expect(visibleEvidence("photo block 1")).toBeNull();
  });

  it("drops nothing to show", () => {
    expect(visibleEvidence("")).toBeNull();
    expect(visibleEvidence("   ")).toBeNull();
    expect(visibleEvidence(null)).toBeNull();
    expect(visibleEvidence(undefined)).toBeNull();
  });
});
