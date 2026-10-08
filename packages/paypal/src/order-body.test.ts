import { describe, expect, it } from "vitest";
import { CONDITION_LABELS, PAYPAL_LIMITS, getFixture, toPaypalAmount } from "@pay-pals/contracts";
import { CardNotLockedError, buildOrderBody, describeCard, trimTo } from "./order-body";

const fx = getFixture("clean-ps5");
const locked = fx.cards[1]!;
const dealId = fx.deal.id;
const PRICE = toPaypalAmount(locked.askingPrice);

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
      value: PRICE,
      breakdown: { item_total: { currency_code: "USD", value: PRICE } },
    });
    const item = unit.items[0];
    expect(item.name).toBe(locked.title);
    expect(item.description).toContain(`Serial ${locked.serial}`);
    expect(item.description).toContain(`Condition: ${CONDITION_LABELS[locked.conditionGrade]}`);
    expect(item.sku).toBe(locked.serial);
    expect(item.quantity).toBe("1");
    expect(item.category).toBe("PHYSICAL_GOODS");
    expect(item.unit_amount).toEqual({ currency_code: "USD", value: PRICE });
  });

  it("keeps every text field inside the PayPal limits", () => {
    const long = {
      ...locked,
      title: "PlayStation ".repeat(20).trim(),
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

  describe("description trimming", () => {
    const limit = PAYPAL_LIMITS.itemDescription;

    it("cuts a long note at a word boundary and ends with an ellipsis, keeping serial and condition whole", () => {
      const notes = "Owned from new, used in a smoke-free home. Light scuff on the base, no marks on the console. Console serial matches the box label.";
      const d = describeCard({ ...locked, conditionNotes: notes });
      expect(d.length).toBeLessThanOrEqual(limit);
      expect(d.startsWith(`Serial ${locked.serial}. Condition: Good. `)).toBe(true);
      expect(d.endsWith("...")).toBe(true);
      // The text before the ellipsis is a whole-word prefix of the note.
      const kept = d.slice(`Serial ${locked.serial}. Condition: Good. `.length, -3);
      expect(notes.startsWith(kept)).toBe(true);
      expect(notes.charAt(kept.length)).toMatch(/[\s,.]/);
      expect(kept).not.toMatch(/\s$/);
    });

    it("never cuts inside Serial or Condition even when the serial is at its longest", () => {
      const d = describeCard({ ...locked, serial: "S".repeat(64), conditionGrade: "like_new", conditionNotes: "Averylongsinglewordnote".repeat(8) });
      expect(d.length).toBeLessThanOrEqual(limit);
      expect(d).toContain(`Serial ${"S".repeat(64)}.`);
      expect(d).toContain("Condition: Like new.");
    });

    it("leaves a short note untouched", () => {
      const d = describeCard({ ...locked, conditionNotes: "Light scuff on the base." });
      expect(d).toBe(`Serial ${locked.serial}. Condition: Good. Light scuff on the base.`);
    });

    it("drops the note rather than the proof when there is no room for words", () => {
      const d = describeCard({ ...locked, serial: "S".repeat(64), conditionNotes: "x".repeat(300) });
      expect(d.length).toBeLessThanOrEqual(limit);
      expect(d.startsWith(`Serial ${"S".repeat(64)}. Condition: Good.`)).toBe(true);
    });

    it("never exceeds the limit for any note length", () => {
      const word = "scuff ";
      for (let n = 0; n < 60; n++) {
        const d = describeCard({ ...locked, conditionNotes: word.repeat(n).trim() });
        expect(d.length).toBeLessThanOrEqual(limit);
        expect(d).toContain(`Serial ${locked.serial}. Condition: Good.`);
      }
    });
  });

  it("writes the history head into custom_id and keeps invoice_id as the bare deal id", () => {
    const head = "f".repeat(64);
    const unit = buildOrderBody(locked, dealId, head).purchase_units[0];
    expect(unit.custom_id).toBe(`${dealId}#${head}`);
    expect(unit.custom_id.length).toBeLessThanOrEqual(PAYPAL_LIMITS.customId);
    expect(unit.invoice_id).toBe(dealId);
    expect(buildOrderBody(locked, dealId, null).purchase_units[0].custom_id).toBe(dealId);
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
  it("leaves short text alone and cuts a single long word hard", () => {
    expect(trimTo("short", 10)).toBe("short");
    expect(trimTo("a".repeat(20), 10)).toBe("aaaaaaa...");
    expect(trimTo("a".repeat(20), 10)).toHaveLength(10);
  });

  it("cuts at the last word boundary that fits and strips trailing punctuation before the ellipsis", () => {
    expect(trimTo("no marks on the console at all", 20)).toBe("no marks on the...");
    expect(trimTo("no marks on the console at all", 20).length).toBeLessThanOrEqual(20);
    expect(trimTo("one, two, three, four", 13)).toBe("one, two...");
    // A boundary exactly at the budget keeps the whole word.
    expect(trimTo("abc def ghij", 10)).toBe("abc def...");
  });
});
