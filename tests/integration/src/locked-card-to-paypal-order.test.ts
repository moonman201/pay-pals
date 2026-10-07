/**
 * The locked card is the PayPal order. Lock the clean-ps5 card in the
 * store, hand what the store returns to buildOrderBody, and check that the
 * payee, deal id, title, serial, condition and amount all come through within
 * PayPal's field limits.
 */
import { describe, expect, it } from "vitest";
import { CONDITION_LABELS, PAYPAL_LIMITS, cleanPs5, toPaypalAmount } from "@pay-pals/contracts";
import type { ItemCard } from "@pay-pals/contracts";
import { CardNotLockedError, buildOrderBody } from "@pay-pals/paypal";
import { driveTo, seedFixture } from "./seed";

async function lockedCleanCard(): Promise<{ card: ItemCard; dealId: string }> {
  const seeded = await seedFixture(cleanPs5);
  await driveTo(seeded, "AGREED");
  const current = (await seeded.store.getCurrentCard(seeded.dealId))!;
  await seeded.store.lockCard(seeded.dealId, current.version);
  const card = (await seeded.store.getCard(seeded.dealId, current.version))!;
  return { card, dealId: seeded.dealId };
}

describe("locked card text survives into the PayPal order", () => {
  it("pays the seller, carries the deal id, and names the item", async () => {
    const { card, dealId } = await lockedCleanCard();
    const body = buildOrderBody(card, dealId);
    const unit = body.purchase_units[0];

    expect(body.intent).toBe("CAPTURE");
    expect(body.purchase_units).toHaveLength(1);
    expect(unit.payee.email_address).toBe(cleanPs5.cards[1]!.sellerPaypalEmail);
    expect(unit.payee.email_address).toBe(card.sellerPaypalEmail);
    expect(unit.custom_id).toBe(dealId);
    expect(unit.invoice_id).toBe(dealId);
    expect(unit.items).toHaveLength(1);
    expect(unit.items[0].name).toBe(card.title);
    expect(unit.items[0].quantity).toBe("1");
    expect(unit.items[0].category).toBe("PHYSICAL_GOODS");
  });

  it("puts the serial and the condition label in the item description", async () => {
    const { card, dealId } = await lockedCleanCard();
    const item = buildOrderBody(card, dealId).purchase_units[0].items[0];

    expect(card.serial).not.toBeNull();
    expect(item.description).toContain(card.serial!);
    expect(item.description).toContain(CONDITION_LABELS[card.conditionGrade]);
    expect(item.sku).toBe(card.serial);
  });

  it("charges exactly the locked asking price in USD", async () => {
    const { card, dealId } = await lockedCleanCard();
    const unit = buildOrderBody(card, dealId).purchase_units[0];

    expect(unit.amount.value).toBe("420.00");
    expect(unit.amount.value).toBe(toPaypalAmount(card.askingPrice));
    expect(unit.amount.currency_code).toBe("USD");
    expect(unit.amount.breakdown.item_total).toEqual({ currency_code: "USD", value: "420.00" });
    expect(unit.items[0].unit_amount).toEqual({ currency_code: "USD", value: "420.00" });
  });

  it("keeps every string inside PAYPAL_LIMITS", async () => {
    const { card, dealId } = await lockedCleanCard();
    const unit = buildOrderBody(card, dealId).purchase_units[0];
    const item = unit.items[0];

    expect(item.name.length).toBeLessThanOrEqual(PAYPAL_LIMITS.itemName);
    expect(item.description.length).toBeLessThanOrEqual(PAYPAL_LIMITS.itemDescription);
    expect((item.sku ?? "").length).toBeLessThanOrEqual(PAYPAL_LIMITS.itemSku);
    expect(unit.custom_id.length).toBeLessThanOrEqual(PAYPAL_LIMITS.customId);
    expect(unit.invoice_id.length).toBeLessThanOrEqual(PAYPAL_LIMITS.invoiceId);
    expect(unit.description.length).toBeLessThanOrEqual(PAYPAL_LIMITS.purchaseUnitDescription);
    expect(unit.reference_id.length).toBeLessThanOrEqual(PAYPAL_LIMITS.customId);
  });

  it("still fits the limits when the card text is as long as the schema allows", async () => {
    const { card, dealId } = await lockedCleanCard();
    const long: ItemCard = {
      ...card,
      title: "T".repeat(120),
      serial: "S".repeat(64),
      conditionNotes: "n".repeat(600),
    };
    const unit = buildOrderBody(long, dealId).purchase_units[0];
    const item = unit.items[0];

    expect(item.name.length).toBeLessThanOrEqual(PAYPAL_LIMITS.itemName);
    expect(item.description.length).toBeLessThanOrEqual(PAYPAL_LIMITS.itemDescription);
    expect(item.description).toContain(long.serial!);
    expect(item.description).toContain(CONDITION_LABELS[long.conditionGrade]);
    expect(unit.description.length).toBeLessThanOrEqual(PAYPAL_LIMITS.purchaseUnitDescription);
  });

  it("refuses an unlocked card", async () => {
    const seeded = await seedFixture(cleanPs5);
    const current = (await seeded.store.getCurrentCard(seeded.dealId))!;
    expect(current.lockedAt).toBeNull();
    expect(() => buildOrderBody(current, seeded.dealId)).toThrow(CardNotLockedError);
  });
});
