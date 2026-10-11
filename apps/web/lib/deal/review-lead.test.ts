import type { RedFlag, RedFlagCode, Verdict } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { reviewLead } from "./review-lead";

const flag = (code: RedFlagCode, severity: RedFlag["severity"]): RedFlag => ({ code, severity, evidence: "e", explanation: "x", raisedByRule: true });

function verdict(overrides: Partial<Verdict> = {}): Verdict {
  return { dealId: "d1", cardVersion: 1, overall: "stop", flags: [], priceCheck: null, questionsForSeller: [], palMessage: "A paragraph.", createdAt: "2026-10-11T00:00:00.000Z", ...overrides };
}

describe("reviewLead", () => {
  it("heads each verdict in three words or fewer", () => {
    expect(reviewLead(verdict({ overall: "stop" })).headline).toBe("Stop. Don't pay.");
    expect(reviewLead(verdict({ overall: "caution" })).headline).toBe("Careful. Ask first.");
    expect(reviewLead(verdict({ overall: "go" })).headline).toBe("Looks good.");
    for (const overall of ["stop", "caution", "go"] as const) {
      expect(reviewLead(verdict({ overall })).headline.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(3);
    }
  });

  it("keeps every reason to one short line", () => {
    const all: RedFlagCode[] = [
      "FRIENDS_AND_FAMILY_REQUEST",
      "OFF_PLATFORM_PAYMENT",
      "PRICE_FAR_BELOW_MARKET",
      "URGENCY_PRESSURE",
      "NAME_MISMATCH",
      "STOCK_OR_REUSED_PHOTO",
      "MISSING_SERIAL",
      "SHIP_BEFORE_PAY_TRICK",
      "INVITE_REFUSED",
      "CERT_MISMATCH",
      "MISSING_PACKING_PHOTO",
      "OTHER",
    ];
    for (const code of all) {
      const [line] = reviewLead(verdict({ flags: [flag(code, "caution")] })).reasons;
      expect(line, code).toBeTruthy();
      expect(line!.split(/\s+/).filter(Boolean).length, code).toBeLessThanOrEqual(12);
      expect(line, code).not.toContain("—");
    }
  });

  it("takes the worst three, worst first, and keeps the pal's order inside a severity", () => {
    const lead = reviewLead(
      verdict({ flags: [flag("URGENCY_PRESSURE", "caution"), flag("OTHER", "info"), flag("INVITE_REFUSED", "stop"), flag("MISSING_SERIAL", "caution")] }),
    );
    expect(lead.reasons).toHaveLength(3);
    expect(lead.reasons[0]).toBe("The seller refused Pay Pals protection.");
    expect(lead.reasons[1]).toBe("Pushing you to pay before the checks are done.");
    expect(lead.reasons[2]).toBe("No serial number, so there is nothing to match on arrival.");
  });

  it("claims no web search for the photo flag, because the check is against Pay Pals' own set", () => {
    const [line] = reviewLead(verdict({ flags: [flag("STOCK_OR_REUSED_PHOTO", "caution")] })).reasons;
    expect(line).toBe("A photo is one Pay Pals already holds, not the seller's own.");
    // packages/agents/src/rules/stock-photo.ts forbids every one of these.
    expect(line).not.toMatch(/catalog|listing|online|web|internet|traced/i);
  });

  it("uses the pal's own findings as the reasons when nothing was flagged", () => {
    const reasoning = { checked: ["x"], found: ["The serial matches the box label.", "The price sits inside the range.", "Three.", "Four."], couldNotVerify: [], wouldChangeMyMind: [] };
    const lead = reviewLead(verdict({ overall: "go", reasoning }));
    expect(lead.reasons).toEqual(["The serial matches the box label.", "The price sits inside the range.", "Three."]);
  });

  it("has no reasons at all for a verdict with no flags and no findings", () => {
    expect(reviewLead(verdict({ overall: "go" })).reasons).toEqual([]);
  });

  it("joins the asks into one line, and has none when the pal named none", () => {
    const reasoning = { checked: [], found: [], couldNotVerify: [], wouldChangeMyMind: ["A receipt would change this.", "A photo in his hands would change this."] };
    expect(reviewLead(verdict({ reasoning })).lookAgain).toBe("A receipt would change this. a photo in his hands would change this.");
    expect(reviewLead(verdict()).lookAgain).toBeNull();
  });

  it("survives a verdict stored before the pal had reasons", () => {
    const lead = reviewLead(verdict({ overall: "go" }));
    expect(lead.headline).toBe("Looks good.");
    expect(lead.lookAgain).toBeNull();
  });
});
