import type { RedFlag, Verdict } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { gateFor } from "./override";

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
    expect(gateFor(verdict("stop", [flag("URGENCY_PRESSURE", "caution"), flag("MISSING_SERIAL", "caution")]))).toBe("override");
  });

  it("blocks on any payment-method flag, whatever else is there", () => {
    expect(gateFor(verdict("stop", [flag("FRIENDS_AND_FAMILY_REQUEST", "stop")]))).toBe("blocked");
    expect(gateFor(verdict("caution", [flag("OFF_PLATFORM_PAYMENT", "stop"), flag("PRICE_FAR_BELOW_MARKET", "caution")]))).toBe("blocked");
  });
});
