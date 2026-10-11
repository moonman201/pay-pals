import { describe, expect, it } from "vitest";
import type { RedFlag } from "@pay-pals/contracts";
import { collapsePaymentFlags } from "./payment-collapse";

const rule = (code: RedFlag["code"], evidence: string, raisedByRule = true): RedFlag => ({ code, severity: "stop", evidence, explanation: "x", raisedByRule });
const urgency: RedFlag = { code: "URGENCY_PRESSURE", severity: "caution", evidence: 'Seller wrote: "has to be today"', explanation: "Rushing.", raisedByRule: true };

describe("collapsePaymentFlags", () => {
  it("keeps Friends and Family over off platform, quoting the seller once and naming both demands", () => {
    const flags = collapsePaymentFlags([rule("FRIENDS_AND_FAMILY_REQUEST", 'Seller wrote: "first to send Friends & Family gets it."'), urgency, rule("OFF_PLATFORM_PAYMENT", 'Seller wrote: "or Zelle in the next hour"')]);
    expect(flags.map((f) => f.code)).toEqual(["FRIENDS_AND_FAMILY_REQUEST", "URGENCY_PRESSURE"]);
    expect(flags[0]!.evidence).toBe('Seller wrote: "first to send Friends & Family gets it."');
    expect(flags[0]!.explanation).toBe("Wants Friends and Family or payment outside PayPal. That has no buyer protection.");
  });
  it("keeps a refusal over everything", () => {
    const flags = collapsePaymentFlags([rule("OFF_PLATFORM_PAYMENT", "zelle"), rule("INVITE_REFUSED", 'Seller wrote: "Friends & Family only"'), rule("FRIENDS_AND_FAMILY_REQUEST", "ff")]);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.code).toBe("INVITE_REFUSED");
    expect(flags[0]!.explanation).toContain("Refused Pay Pals protection and wants Friends and Family or payment outside PayPal.");
  });
  it("lets a rule-raised flag outrank a model-added one, whatever the code", () => {
    const flags = collapsePaymentFlags([rule("FRIENDS_AND_FAMILY_REQUEST", "ff"), rule("INVITE_REFUSED", "model guess", false)]);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ code: "FRIENDS_AND_FAMILY_REQUEST", raisedByRule: true, evidence: "ff" });
  });
  it("leaves a single payment flag and non-payment flags alone", () => {
    const single = [rule("OFF_PLATFORM_PAYMENT", "zelle"), urgency];
    expect(collapsePaymentFlags(single)).toEqual(single);
    expect(collapsePaymentFlags([urgency])).toEqual([urgency]);
  });
});
