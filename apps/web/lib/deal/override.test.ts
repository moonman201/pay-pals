import type { RedFlag, Verdict } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { gateFor, stopWarning } from "./override";

function verdict(overall: Verdict["overall"], flags: RedFlag[]): Verdict {
  return { dealId: "d", cardVersion: 1, overall, flags, priceCheck: null, questionsForSeller: [], palMessage: "m", createdAt: new Date().toISOString() };
}
const flag = (code: RedFlag["code"], severity: RedFlag["severity"]): RedFlag => ({ code, severity, evidence: "e", explanation: "x", raisedByRule: true });

describe("gateFor", () => {
  it("is open with no verdict or a go verdict", () => {
    expect(gateFor(null)).toBe("open");
    expect(gateFor(verdict("go", []))).toBe("open");
  });

  it("asks for an override on caution flags", () => {
    expect(gateFor(verdict("caution", [flag("PRICE_FAR_BELOW_MARKET", "caution")]))).toBe("override");
    expect(gateFor(verdict("caution", [flag("URGENCY_PRESSURE", "caution"), flag("MISSING_SERIAL", "caution")]))).toBe("override");
  });

  it("gives a sterner, still overridable gate on a non-payment stop", () => {
    expect(gateFor(verdict("stop", [flag("PRICE_FAR_BELOW_MARKET", "stop")]))).toBe("stop_override");
    expect(gateFor(verdict("stop", [flag("SHIP_BEFORE_PAY_TRICK", "stop"), flag("URGENCY_PRESSURE", "caution")]))).toBe("stop_override");
  });

  it("blocks on any payment-method flag, whatever else is there", () => {
    expect(gateFor(verdict("stop", [flag("FRIENDS_AND_FAMILY_REQUEST", "stop")]))).toBe("blocked");
    expect(gateFor(verdict("caution", [flag("OFF_PLATFORM_PAYMENT", "stop"), flag("PRICE_FAR_BELOW_MARKET", "stop")]))).toBe("blocked");
  });
});

describe("stopWarning", () => {
  it("is three plain sentences that name the flags", () => {
    const lines = stopWarning(verdict("stop", [flag("PRICE_FAR_BELOW_MARKET", "stop"), flag("SHIP_BEFORE_PAY_TRICK", "stop")]));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("a price far below market and a trick to get money before shipping");
    expect(lines[1]).toMatch(/never ships/);
    expect(lines[2]).toMatch(/Goods and Services/);
    for (const line of lines) expect(line).not.toMatch(/[!]/);
  });
});
