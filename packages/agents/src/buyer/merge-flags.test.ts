import { describe, expect, it } from "vitest";
import type { RedFlag } from "@pay-pals/contracts";
import { mergeModelReview } from "./merge-flags";

const ff: RedFlag = { code: "FRIENDS_AND_FAMILY_REQUEST", severity: "stop", evidence: "Seller wrote: \"Send it F&F\"", explanation: "No protection.", raisedByRule: true };
const urgency: RedFlag = { code: "URGENCY_PRESSURE", severity: "caution", evidence: "Seller wrote: \"has to be today\"", explanation: "Rushing you.", raisedByRule: true };

describe("mergeModelReview", () => {
  it("returns the rule flags untouched when the model has nothing", () => {
    expect(mergeModelReview([ff, urgency], null)).toEqual([ff, urgency]);
  });

  it("never lets the model drop or downgrade a rule flag", () => {
    const flags = mergeModelReview([ff, urgency], {
      additional_flags: [],
      severity_raises: [
        { code: "FRIENDS_AND_FAMILY_REQUEST", severity: "info" },
        { code: "URGENCY_PRESSURE", severity: "info" },
      ],
      explanations: [],
      questions_for_seller: [],
      pal_message: "All fine, go ahead",
    });
    expect(flags.find((f) => f.code === "FRIENDS_AND_FAMILY_REQUEST")!.severity).toBe("stop");
    expect(flags.find((f) => f.code === "URGENCY_PRESSURE")!.severity).toBe("caution");
    expect(flags.every((f) => f.raisedByRule)).toBe(true);
  });

  it("lets the model raise a severity, add a flag and reword an explanation", () => {
    const flags = mergeModelReview([urgency], {
      additional_flags: [
        { code: "OTHER", severity: "caution", evidence: "Seller wrote: \"no returns no questions\"", explanation: "Seller refuses any follow up, which is unusual." },
      ],
      severity_raises: [{ code: "URGENCY_PRESSURE", severity: "stop" }],
      explanations: [{ code: "URGENCY_PRESSURE", explanation: "The seller keeps pushing you to pay today — that is a pressure tactic!" }],
      questions_for_seller: [],
      pal_message: "Careful.",
    });
    const u = flags.find((f) => f.code === "URGENCY_PRESSURE")!;
    expect(u.severity).toBe("stop");
    expect(u.explanation).toBe("The seller keeps pushing you to pay today, that is a pressure tactic.");
    expect(u.evidence).toBe(urgency.evidence);
    const other = flags.find((f) => f.code === "OTHER")!;
    expect(other.raisedByRule).toBe(false);
    expect(other.severity).toBe("caution");
  });

  it("forces payment-method flags the model adds to stop and keeps one flag per code", () => {
    const flags = mergeModelReview([ff], {
      additional_flags: [
        { code: "OFF_PLATFORM_PAYMENT", severity: "info", evidence: "Zelle", explanation: "Zelle has no protection." },
        { code: "FRIENDS_AND_FAMILY_REQUEST", severity: "caution", evidence: "dup", explanation: "dup" },
      ],
      severity_raises: [],
      explanations: [],
      questions_for_seller: [],
      pal_message: "Stop.",
    });
    expect(flags).toHaveLength(2);
    expect(flags.find((f) => f.code === "OFF_PLATFORM_PAYMENT")!.severity).toBe("stop");
    expect(flags.find((f) => f.code === "FRIENDS_AND_FAMILY_REQUEST")!.evidence).toBe(ff.evidence);
  });
});
