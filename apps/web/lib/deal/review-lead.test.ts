import type { RedFlag, RedFlagCode, Verdict } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { reviewLead } from "./review-lead";

/*
  Explanation empty by default, so these exercise the fallback map. The pal's
  own sentence is preferred when it has one, which its own tests cover.
*/
const flag = (code: RedFlagCode, severity: RedFlag["severity"], explanation = ""): RedFlag => ({ code, severity, evidence: "e", explanation, raisedByRule: true });

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

  it("prefers the pal's own sentence, so the room never phrases one finding twice", () => {
    const own = "His only photo matches a listing photo already on file.";
    expect(reviewLead(verdict({ flags: [flag("STOCK_OR_REUSED_PHOTO", "caution", own)] })).reasons[0]).toBe(own);
  });

  it("falls back to its own line when the pal's explanation is a paragraph", () => {
    const paragraph = "The seller shipped without the photo of the item going into the box, so there is no proof at all of what was packed or when.";
    expect(reviewLead(verdict({ flags: [flag("MISSING_PACKING_PHOTO", "caution", paragraph)] })).reasons[0]).toBe("Shipped without the packing photo that was asked for.");
  });

  it("says a photo is on file, never that it was found by searching", () => {
    // The check is a hash against Pay Pals' own reference folder, which holds the
    // listing photos. "On file" is true of that folder; "online" would describe a
    // search nobody ran.
    const [line] = reviewLead(verdict({ flags: [flag("STOCK_OR_REUSED_PHOTO", "caution")] })).reasons;
    expect(line).toBe("A photo matches a listing photo already on file.");
    expect(line).not.toMatch(/online|web|internet|traced|searched/i);
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

  it("takes two asks at most, because five of them is the paragraph this replaced", () => {
    const five = ["One would change this.", "Two would change this.", "Three would change this.", "Four would change this.", "Five would change this."];
    const line = reviewLead(verdict({ reasoning: { checked: [], found: [], couldNotVerify: [], wouldChangeMyMind: five } })).lookAgain!;
    expect(line).toBe("One would change this. two would change this.");
    expect(line).not.toContain("Three");
    expect(line.split(/\s+/).length).toBeLessThanOrEqual(20);
  });

  it("hands the asks it had no room for to the expander, rather than losing them", () => {
    const five = ["One would change this.", "Two would change this.", "Three would change this.", "Four would change this.", "Five would change this."];
    const lead = reviewLead(verdict({ reasoning: { checked: [], found: [], couldNotVerify: [], wouldChangeMyMind: five } }));
    // Every ask is somewhere: two in the line, three waiting behind the disclosure.
    expect(lead.restOfAsks).toEqual(["Three would change this.", "Four would change this.", "Five would change this."]);
    expect(lead.restOfAsks).toHaveLength(five.length - 2);
  });

  it("has nothing left over when the pal named two or fewer", () => {
    const two = { checked: [], found: [], couldNotVerify: [], wouldChangeMyMind: ["One.", "Two."] };
    expect(reviewLead(verdict({ reasoning: two })).restOfAsks).toEqual([]);
    expect(reviewLead(verdict()).restOfAsks).toEqual([]);
  });

  it("survives a verdict stored before the pal had reasons", () => {
    const lead = reviewLead(verdict({ overall: "go" }));
    expect(lead.headline).toBe("Looks good.");
    expect(lead.lookAgain).toBeNull();
  });
});
