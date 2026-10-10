import { DEAL_STATES, type DealEvent, type DealState } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import {
  canChooseOffPlatform,
  hasChosenOffPlatform,
  OFF_PLATFORM_BUTTON,
  OFF_PLATFORM_CONFIRM,
  OFF_PLATFORM_CONFIRM_BUTTON,
  OFF_PLATFORM_PAL_LINE,
  OFF_PLATFORM_STATES,
  OFF_PLATFORM_SUMMARY,
  OFF_PLATFORM_WARNING,
  ON_YOUR_OWN,
  offPlatformNotice,
} from "./off-platform";

function event(kind: DealEvent["kind"]): DealEvent {
  return { id: `e-${kind}`, dealId: "d", kind, actor: "buyer", summary: "x", at: "2026-10-10T10:00:00.000Z", prevHash: null, hash: "a".repeat(64) };
}

const chosen = [event("state_changed"), event("off_platform_chosen")];

describe("hasChosenOffPlatform", () => {
  it("finds the event wherever it sits", () => {
    expect(hasChosenOffPlatform(chosen)).toBe(true);
    expect(hasChosenOffPlatform([event("payment_created")])).toBe(false);
    expect(hasChosenOffPlatform([])).toBe(false);
  });
});

describe("canChooseOffPlatform", () => {
  it("is offered while the buyer is deciding how to pay, and on a blocked deal", () => {
    for (const state of ["REVIEWED", "AGREED", "PAYMENT_PENDING", "BLOCKED"] as DealState[]) {
      expect(canChooseOffPlatform(state, []), state).toBe(true);
    }
  });

  it("is never offered once Pay Pals has taken a payment of its own", () => {
    for (const state of ["PAID", "SHIPPED", "DELIVERED", "COMPLETE", "ISSUE"] as DealState[]) {
      expect(canChooseOffPlatform(state, []), state).toBe(false);
    }
  });

  it("covers every deal state one way or the other, so a new state cannot slip through unconsidered", () => {
    for (const state of DEAL_STATES) expect(typeof canChooseOffPlatform(state, []), state).toBe("boolean");
    expect(OFF_PLATFORM_STATES.every((s) => (DEAL_STATES as readonly string[]).includes(s))).toBe(true);
  });

  it("is not offered twice", () => {
    expect(canChooseOffPlatform("BLOCKED", chosen)).toBe(false);
    expect(canChooseOffPlatform("AGREED", chosen)).toBe(false);
  });
});

describe("the words", () => {
  it("says Matt's sentence, in his words", () => {
    expect(ON_YOUR_OWN).toBe("You're on your own from here: no PayPal protection and no dispute path.");
  });

  it("puts that sentence on the warning, the timeline line and the room afterwards", () => {
    expect(OFF_PLATFORM_WARNING).toContain(ON_YOUR_OWN);
    expect(OFF_PLATFORM_SUMMARY).toContain(ON_YOUR_OWN);
    expect(offPlatformNotice("CANCELLED")).toContain(ON_YOUR_OWN);
  });

  it("says Pay Pals never handles the payment, in every place it speaks", () => {
    expect(OFF_PLATFORM_WARNING[0]).toMatch(/only ever creates a PayPal Goods and Services payment/);
    expect(OFF_PLATFORM_SUMMARY).toMatch(/created no order/);
    expect(offPlatformNotice("CANCELLED")).toMatch(/created no order/);
    expect(OFF_PLATFORM_PAL_LINE).toMatch(/not handling that payment/);
  });

  it("tells the buyer their checks are still theirs, rather than scolding them", () => {
    const all = [...OFF_PLATFORM_WARNING, OFF_PLATFORM_SUMMARY, OFF_PLATFORM_PAL_LINE, OFF_PLATFORM_CONFIRM, OFF_PLATFORM_CONFIRM_BUTTON, OFF_PLATFORM_BUTTON, offPlatformNotice("CANCELLED"), offPlatformNotice("BLOCKED")];
    expect(OFF_PLATFORM_WARNING.join(" ")).toMatch(/stays on this deal/);
    expect(offPlatformNotice("CANCELLED")).toMatch(/still on this page/);
    for (const line of all) {
      expect(line).not.toContain("—");
      expect(line.toLowerCase()).not.toMatch(/\b(warning|danger|risky|foolish|mistake|are you sure|we strongly|careful)\b/);
    }
  });

  it("says plainly which end the deal came to", () => {
    expect(offPlatformNotice("CANCELLED")).toMatch(/Pay Pals closed its part of the deal here/);
    expect(offPlatformNotice("BLOCKED")).toMatch(/already closed before that/);
    expect(offPlatformNotice("AGREED")).toMatch(/Pay Pals closed its part of the deal here/);
  });

  it("says no order was created only when none was", () => {
    expect(offPlatformNotice("CANCELLED")).toContain("Pay Pals created no order, is not handling your payment, and has no record of it.");
    expect(offPlatformNotice("BLOCKED", null)).toContain("created no order");
  });

  it("never says no order was created when one exists, and names it", () => {
    // The PAYMENT_PENDING path: the buyer pressed Pay, an order exists, and then chose to pay another way.
    const notice = offPlatformNotice("CANCELLED", "DEMO-A89AFF30");
    expect(notice).not.toMatch(/created no order/);
    expect(notice).toContain("Pay Pals had already created PayPal order DEMO-A89AFF30 for this deal.");
    expect(notice).toMatch(/will not capture it, so no money moves through that order/);
    expect(notice).toMatch(/not handling the payment you make elsewhere/);
  });

  it("keeps Matt's sentence and the rest of the notice either way", () => {
    for (const orderId of [null, "2NW245573K1279237"]) {
      const notice = offPlatformNotice("CANCELLED", orderId);
      expect(notice, String(orderId)).toContain(ON_YOUR_OWN);
      expect(notice, String(orderId)).toMatch(/^You chose to pay outside PayPal Goods and Services\./);
      expect(notice, String(orderId)).toMatch(/Everything your pal checked is still on this page\.$/);
      expect(notice, String(orderId)).not.toContain("—");
    }
  });

  it("labels the control with what it does, not with a nudge either way", () => {
    expect(OFF_PLATFORM_BUTTON).toBe("I will pay another way");
    expect(OFF_PLATFORM_CONFIRM_BUTTON).toBe("Yes, record it and step back");
    expect(OFF_PLATFORM_CONFIRM).toMatch(/no PayPal protection and no dispute path/);
    expect(OFF_PLATFORM_CONFIRM).toMatch(/ends Pay Pals' part of the deal/);
  });
});
