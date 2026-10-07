/**
 * Scenario 3 across the modules: the wrong-item deal runs through the store
 * to DELIVERED, the Buyer Pal compares the arrival photos to the locked card
 * and names the serial mismatch, the deal moves to ISSUE, and the evidence
 * pack carries the locked card, the arrival photos and both serials.
 */
import { describe, expect, it } from "vitest";
import { EvidencePackSchema, WRONG_ITEM_ARRIVED_SERIAL, WRONG_ITEM_LOCKED_SERIAL, wrongItem } from "@pay-pals/contracts";
import type { ArrivalCheck, EvidenceInput, EvidencePack, ItemCard } from "@pay-pals/contracts";
import { buildEvidencePack, createBuyerPal, createFixturePriceLookup } from "@pay-pals/agents";
import { driveTo, seedFixture } from "./seed";
import type { SeededDeal } from "./seed";

const buyerPal = createBuyerPal({ anthropic: null, priceLookup: createFixturePriceLookup() });

interface DeliveredDeal {
  seeded: SeededDeal;
  lockedCard: ItemCard;
}

/** Review, agree and lock, pay, ship, deliver. Saves the verdict, payment and shipment along the way. */
async function deliverWrongItem(): Promise<DeliveredDeal> {
  const seeded = await seedFixture(wrongItem);
  const { store, dealId } = seeded;

  const card = (await store.getCurrentCard(dealId))!;
  const chat = await store.listMessages(dealId, "deal");
  const { data: verdict } = await buyerPal.review(card, chat, { seller: wrongItem.seller });
  expect(verdict.overall).not.toBe("stop");
  await store.saveVerdict(verdict);

  await driveTo(seeded, "AGREED");
  const lockedCard = await store.lockCard(dealId, card.version);
  await store.transition(dealId, "PAYMENT_PENDING", "system", "Payment pending.");
  await store.savePayment(seeded.payment!);
  await store.transition(dealId, "PAID", "system", "Paid.");
  await store.saveShipment(seeded.shipment!);
  await store.transition(dealId, "SHIPPED", "seller", "Shipped.");
  await store.transition(dealId, "DELIVERED", "buyer", "Delivered.");
  expect((await store.getDeal(dealId))!.state).toBe("DELIVERED");
  return { seeded, lockedCard };
}

async function checkAndRaiseIssue(delivered: DeliveredDeal): Promise<ArrivalCheck> {
  const { seeded, lockedCard } = delivered;
  const { data: check } = await buyerPal.checkArrival(lockedCard, seeded.arrivalPhotos);
  await seeded.store.saveArrivalCheck(check);
  await seeded.store.transition(seeded.dealId, "ISSUE", "buyer_pal", "Issue opened: the item that arrived is not the one on the card.");
  return check;
}

async function gatherEvidence(delivered: DeliveredDeal): Promise<EvidenceInput> {
  const { seeded, lockedCard } = delivered;
  const { store, dealId } = seeded;
  return {
    deal: (await store.getDeal(dealId))!,
    lockedCard,
    verdicts: await store.listVerdicts(dealId),
    arrivalCheck: await store.getArrivalCheck(dealId),
    messages: await store.listMessages(dealId),
    payment: await store.getPayment(dealId),
    shipment: await store.getShipment(dealId),
    timeline: await store.listEvents(dealId),
    arrivalPhotos: seeded.arrivalPhotos,
    requestedBy: "buyer",
  };
}

describe("wrong-item: arrival check to evidence pack", () => {
  it("names the serial mismatch against the locked card", async () => {
    const delivered = await deliverWrongItem();
    const check = await checkAndRaiseIssue(delivered);

    expect(check.matches).toBe(false);
    expect(check.cardVersion).toBe(delivered.lockedCard.version);
    const fields = check.mismatches.map((m) => m.field);
    for (const field of wrongItem.expectedArrival!.mismatchFields) expect(fields).toContain(field);

    const serial = check.mismatches.find((m) => m.field === "serial")!;
    expect(serial.expected).toBe(WRONG_ITEM_LOCKED_SERIAL);
    expect(serial.observed).toBe(WRONG_ITEM_ARRIVED_SERIAL);
    expect(check.observed.serial).toBe(WRONG_ITEM_ARRIVED_SERIAL);
    expect(check.palMessage).toContain(WRONG_ITEM_ARRIVED_SERIAL);

    const { store, dealId } = delivered.seeded;
    expect((await store.getArrivalCheck(dealId))!.matches).toBe(false);
    expect((await store.getDeal(dealId))!.state).toBe("ISSUE");
  });

  it("builds an evidence pack with the locked card, the arrival photos and both serials in the summary", async () => {
    const delivered = await deliverWrongItem();
    await checkAndRaiseIssue(delivered);
    const input = await gatherEvidence(delivered);

    const { data: pack, palMessage } = await buildEvidencePack(input, { anthropic: null });
    expect(EvidencePackSchema.safeParse(pack).success).toBe(true);
    expect(pack.dealId).toBe(delivered.seeded.dealId);
    expect(pack.builtBy).toBe("buyer_pal");

    expect(pack.lockedCard.lockedAt).not.toBeNull();
    expect(pack.lockedCard.version).toBe(delivered.lockedCard.version);
    expect(pack.lockedCard.serial).toBe(WRONG_ITEM_LOCKED_SERIAL);

    const urls = pack.photos.map((p) => p.url);
    for (const photo of wrongItem.arrivalPhotos) expect(urls).toContain(photo.url);
    for (const photo of delivered.lockedCard.photos) expect(urls).toContain(photo.url);
    expect(new Set(urls).size).toBe(urls.length);

    expect(pack.summary).toContain(WRONG_ITEM_LOCKED_SERIAL);
    expect(pack.summary).toContain(WRONG_ITEM_ARRIVED_SERIAL);
    expect(pack.summary).toContain(wrongItem.payment!.paypalOrderId);
    expect(pack.summary).toContain(wrongItem.shipment!.trackingNumber);
    expect(pack.arrivalCheck?.matches).toBe(false);
    expect(pack.payment?.paypalOrderId).toBe(wrongItem.payment!.paypalOrderId);
    expect(pack.shipment?.trackingNumber).toBe(wrongItem.shipment!.trackingNumber);
    expect(pack.timeline.some((e) => e.kind === "state_changed" && e.toState === "ISSUE")).toBe(true);
    expect(palMessage).toContain("dispute");
  });

  it("stores the pack and reads it back unchanged", async () => {
    const delivered = await deliverWrongItem();
    await checkAndRaiseIssue(delivered);
    const { data: pack } = await buildEvidencePack(await gatherEvidence(delivered), { anthropic: null });
    const { store, dealId } = delivered.seeded;

    await store.saveEvidence(pack);
    const stored: EvidencePack | null = await store.getEvidence(dealId);
    expect(stored).toEqual(pack);
  });
});
