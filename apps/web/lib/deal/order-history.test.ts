import { buildCustomId, emptyBox } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { checkOrderHistory, dealIdWarning, orderHistoryLine } from "./order-history";

const events = emptyBox.timeline;
const head = events[events.length - 1]!.hash;
const dealId = emptyBox.deal.id;

describe("checkOrderHistory", () => {
  it("has nothing to show when PayPal returned no custom_id", () => {
    expect(checkOrderHistory(null, dealId, events)).toBeNull();
  });

  it("reads the deal id and the hash out of PayPal's custom_id and verifies the stored events against it", () => {
    const check = checkOrderHistory(buildCustomId(dealId, head), dealId, events)!;
    expect(check.dealIdOnOrder).toBe(dealId);
    expect(check.historyHash).toBe(head);
    expect(check.dealIdMatches).toBe(true);
    expect(check.matches).toBe(true);
    expect(check.events).toBe(events.length);
  });

  it("does not verify when the hash on the order is not the stored chain head", () => {
    const check = checkOrderHistory(buildCustomId(dealId, "f".repeat(64)), dealId, events)!;
    expect(check.matches).toBe(false);
  });

  it("does not verify when an event was edited after the order was created", () => {
    const edited = events.map((e, i) => (i === 1 ? { ...e, summary: `${e.summary} (edited)` } : e));
    expect(checkOrderHistory(buildCustomId(dealId, head), dealId, edited)!.matches).toBe(false);
  });

  it("says there is nothing to check when the order carries only a deal id", () => {
    const check = checkOrderHistory(dealId, dealId, events)!;
    expect(check.historyHash).toBeNull();
    expect(check.matches).toBeNull();
  });

  it("notices when the deal id on the order is some other deal", () => {
    const check = checkOrderHistory(buildCustomId("some-other-deal", head), dealId, events)!;
    expect(check.dealIdMatches).toBe(false);
    expect(dealIdWarning(check)).toMatch(/is not the deal on this page/);
  });
});

describe("orderHistoryLine", () => {
  it("says plainly what the check found, with no em dashes", () => {
    const ok = orderHistoryLine(checkOrderHistory(buildCustomId(dealId, head), dealId, events)!);
    expect(ok).toMatch(new RegExp(`${events.length} events stored here`));
    expect(ok).toMatch(/has not changed since the order was created/);

    const bad = orderHistoryLine(checkOrderHistory(buildCustomId(dealId, "f".repeat(64)), dealId, events)!);
    expect(bad).toMatch(/does not reproduce/);

    const none = orderHistoryLine(checkOrderHistory(dealId, dealId, events)!);
    expect(none).toMatch(/no history hash/);

    for (const line of [ok, bad, none]) expect(line).not.toContain("—");
  });

  it("says event in the singular for one event", () => {
    const one = [events[0]!];
    expect(orderHistoryLine(checkOrderHistory(dealId, dealId, one)!)).not.toContain("1 events");
    expect(orderHistoryLine(checkOrderHistory(buildCustomId(dealId, one[0]!.hash), dealId, one)!)).toContain("1 event stored here");
  });

  it("never says verified, which is a claim about the item and not about the chain", () => {
    for (const customId of [buildCustomId(dealId, head), dealId]) {
      expect(orderHistoryLine(checkOrderHistory(customId, dealId, events)!).toLowerCase()).not.toContain("authentic");
    }
  });
});
