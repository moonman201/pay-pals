import { describe, expect, it } from "vitest";
import { CONDITION_LABELS, PAYPAL_LIMITS, getFixture } from "@pay-pals/contracts";
import { CardNotLockedError, buildOrderBody, describeCard, trimTo } from "./order-body";

const fx = getFixture("clean-garmin");
const locked = fx.cards[1]!;
const dealId = fx.deal.id;

describe("buildOrderBody", () => {
  it("refuses a card that is not locked", () => {
    expect(() => buildOrderBody(fx.cards[0]!, dealId)).toThrow(CardNotLockedError);
  });

  it("pays the seller, tags the deal, and carries title, serial and condition on the line item", () => {
    const body = buildOrderBody(locked, dealId);
    const unit = body.purchase_units[0];
    expect(body.intent).toBe("CAPTURE");
    expect(unit.payee.email_address).toBe(locked.sellerPaypalEmail);
    expect(unit.custom_id).toBe(dealId);
    expect(unit.invoice_id).toBe(dealId);
    expect(unit.amount).toEqual({
      currency_code: "USD",
      value: "475.00",
      breakdown: { item_total: { currency_code: "USD", value: "475.00" } },
    });
    const item = unit.items[0];
    expect(item.name).toBe(locked.title);
    expect(item.description).toContain(`Serial ${locked.serial}`);
    expect(item.description).toContain(`Condition: ${CONDITION_LABELS[locked.conditionGrade]}`);
    expect(item.sku).toBe(locked.serial);
    expect(item.quantity).toBe("1");
    expect(item.category).toBe("PHYSICAL_GOODS");
    expect(item.unit_amount).toEqual({ currency_code: "USD", value: "475.00" });
  });

  it("keeps every text field inside the PayPal limits", () => {
    const long = {
      ...locked,
      title: "Garmin ".repeat(40).trim(),
      serial: "S".repeat(64),
      conditionNotes: "Long notes. ".repeat(80),
    };
    const unit = buildOrderBody(long, dealId).purchase_units[0];
    const item = unit.items[0];
    expect(item.name.length).toBeLessThanOrEqual(PAYPAL_LIMITS.itemName);
    expect(item.description.length).toBeLessThanOrEqual(PAYPAL_LIMITS.itemDescription);
    expect(item.sku!.length).toBeLessThanOrEqual(PAYPAL_LIMITS.itemSku);
    expect(unit.description.length).toBeLessThanOrEqual(PAYPAL_LIMITS.purchaseUnitDescription);
    expect(unit.custom_id.length).toBeLessThanOrEqual(PAYPAL_LIMITS.customId);
    // The serial and condition survive the cut; only the notes are trimmed.
    expect(item.description).toContain(`Serial ${long.serial}.`);
    expect(item.description).toContain("Condition: Good.");
    expect(item.description.endsWith("...")).toBe(true);
  });

  it("says when there is no serial instead of leaving it out", () => {
    expect(describeCard({ ...locked, serial: null })).toMatch(/^Serial not provided\. Condition: Good\./);
    expect(buildOrderBody({ ...locked, serial: null }, dealId).purchase_units[0].items[0].sku).toBeUndefined();
  });

  it("formats cents", () => {
    expect(buildOrderBody({ ...locked, askingPrice: 475.5 }, dealId).purchase_units[0].amount.value).toBe("475.50");
  });
});

describe("trimTo", () => {
  it("leaves short text alone and marks a cut", () => {
    expect(trimTo("short", 10)).toBe("short");
    expect(trimTo("a".repeat(20), 10)).toBe("aaaaaaa...");
    expect(trimTo("a".repeat(20), 10)).toHaveLength(10);
  });
});
