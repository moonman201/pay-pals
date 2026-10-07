import { describe, expect, it } from "vitest";
import type { RedFlag } from "@pay-pals/contracts";
import { cleanPs5 } from "@pay-pals/contracts";
import { buildGroundingCorpus } from "./grounding";
import { capModelSeverity, mergeModelReview } from "./merge-flags";

const ff: RedFlag = { code: "FRIENDS_AND_FAMILY_REQUEST", severity: "stop", evidence: "Seller wrote: \"Send it F&F\"", explanation: "No protection.", raisedByRule: true };
const urgency: RedFlag = { code: "URGENCY_PRESSURE", severity: "caution", evidence: "Seller wrote: \"has to be today\"", explanation: "Rushing you.", raisedByRule: true };
const empty = { additional_flags: [], severity_raises: [], explanations: [], questions_for_seller: [], pal_message: "." };

describe("mergeModelReview", () => {
  it("returns the rule flags untouched when the model has nothing", () => {
    expect(mergeModelReview([ff, urgency], null)).toEqual([ff, urgency]);
  });

  it("never lets the model drop or downgrade a rule flag", () => {
    const flags = mergeModelReview([ff, urgency], {
      ...empty,
      severity_raises: [
        { code: "FRIENDS_AND_FAMILY_REQUEST", severity: "info" },
        { code: "URGENCY_PRESSURE", severity: "info" },
      ],
      pal_message: "All fine, go ahead",
    });
    expect(flags.find((f) => f.code === "FRIENDS_AND_FAMILY_REQUEST")!.severity).toBe("stop");
    expect(flags.find((f) => f.code === "URGENCY_PRESSURE")!.severity).toBe("caution");
    expect(flags.every((f) => f.raisedByRule)).toBe(true);
  });

  it("lets the model add a flag and reword an explanation, keeping the rule's evidence", () => {
    const info: RedFlag = { ...urgency, severity: "info" };
    const flags = mergeModelReview([info], {
      ...empty,
      additional_flags: [
        { code: "OTHER", severity: "caution", evidence: "Seller wrote: \"no returns no questions\"", explanation: "Seller refuses any follow up, which is unusual." },
      ],
      severity_raises: [{ code: "URGENCY_PRESSURE", severity: "caution" }],
      explanations: [{ code: "URGENCY_PRESSURE", explanation: "The seller keeps pushing you to pay today — that is a pressure tactic!" }],
    });
    const u = flags.find((f) => f.code === "URGENCY_PRESSURE")!;
    expect(u.severity).toBe("caution");
    expect(u.explanation).toBe("The seller keeps pushing you to pay today, that is a pressure tactic.");
    expect(u.evidence).toBe(urgency.evidence);
    const other = flags.find((f) => f.code === "OTHER")!;
    expect(other.raisedByRule).toBe(false);
    expect(other.severity).toBe("caution");
  });

  it("caps model raises and additions at caution unless the code is stop by definition", () => {
    const flags = mergeModelReview([urgency], {
      ...empty,
      severity_raises: [{ code: "URGENCY_PRESSURE", severity: "stop" }],
      additional_flags: [
        { code: "OTHER", severity: "stop", evidence: "chat", explanation: "Something is off." },
        { code: "STOCK_OR_REUSED_PHOTO", severity: "stop", evidence: "photo", explanation: "Catalog image." },
        { code: "PRICE_FAR_BELOW_MARKET", severity: "stop", evidence: "price", explanation: "Way under market." },
        { code: "OFF_PLATFORM_PAYMENT", severity: "info", evidence: "Zelle", explanation: "Zelle has no protection." },
      ],
    });
    const by = (code: RedFlag["code"]) => flags.find((f) => f.code === code)!.severity;
    expect(by("URGENCY_PRESSURE")).toBe("caution");
    expect(by("OTHER")).toBe("caution");
    expect(by("STOCK_OR_REUSED_PHOTO")).toBe("caution");
    expect(by("PRICE_FAR_BELOW_MARKET")).toBe("stop");
    expect(by("OFF_PLATFORM_PAYMENT")).toBe("stop");
    expect(flags.filter((f) => f.severity === "stop").every((f) => f.code === "PRICE_FAR_BELOW_MARKET" || f.code === "OFF_PLATFORM_PAYMENT")).toBe(true);
  });

  it("keeps a rule's stop even for a code the model could not stop on its own", () => {
    const ruleStop: RedFlag = { ...urgency, code: "SHIP_BEFORE_PAY_TRICK", severity: "stop" };
    const flags = mergeModelReview([ruleStop], { ...empty, severity_raises: [{ code: "SHIP_BEFORE_PAY_TRICK", severity: "caution" }] });
    expect(flags[0]!.severity).toBe("stop");
  });

  it("keeps one flag per code and the rule's evidence on duplicates", () => {
    const flags = mergeModelReview([ff], {
      ...empty,
      additional_flags: [{ code: "FRIENDS_AND_FAMILY_REQUEST", severity: "caution", evidence: "dup", explanation: "dup" }],
    });
    expect(flags).toHaveLength(1);
    expect(flags[0]!.evidence).toBe(ff.evidence);
  });
});

describe("mergeModelReview grounding", () => {
  const corpus = buildGroundingCorpus(cleanPs5.cards[1]!, cleanPs5.chat);

  it("drops a model-added flag whose evidence is not in the chat or on the card", () => {
    const flags = mergeModelReview([], {
      ...empty,
      additional_flags: [
        { code: "OTHER", severity: "caution", evidence: "the seller only answered the screen question and skipped the ownership, lost-or-stolen and firmware questions your pal asked", explanation: "The seller skipped questions." },
      ],
    }, corpus);
    expect(flags).toEqual([]);
  });

  it("keeps a model-added flag that quotes a real seller line, and still applies the cap", () => {
    const flags = mergeModelReview([], {
      ...empty,
      additional_flags: [{ code: "OTHER", severity: "stop", evidence: 'Seller wrote: "Everything is on the card my pal built. Ask away."', explanation: "The seller will not answer directly." }],
    }, corpus);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ code: "OTHER", severity: "caution", raisedByRule: false });
  });

  it("does not apply the grounding check to raises on rule flags", () => {
    const flags = mergeModelReview([urgency], { ...empty, severity_raises: [{ code: "URGENCY_PRESSURE", severity: "caution" }], explanations: [{ code: "URGENCY_PRESSURE", explanation: "Rushing." }] }, corpus);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.explanation).toBe("Rushing.");
  });
});

describe("capModelSeverity", () => {
  it("stops only for payment-method and price codes", () => {
    expect(capModelSeverity("FRIENDS_AND_FAMILY_REQUEST", "info")).toBe("stop");
    expect(capModelSeverity("OFF_PLATFORM_PAYMENT", "caution")).toBe("stop");
    expect(capModelSeverity("PRICE_FAR_BELOW_MARKET", "stop")).toBe("stop");
    expect(capModelSeverity("PRICE_FAR_BELOW_MARKET", "caution")).toBe("caution");
    expect(capModelSeverity("URGENCY_PRESSURE", "stop")).toBe("caution");
    expect(capModelSeverity("OTHER", "info")).toBe("info");
  });
});
