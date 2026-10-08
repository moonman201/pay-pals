/**
 * Scenario 3 across the modules: the empty-box deal runs through the store
 * to DELIVERED, the Buyer Pal reads the arrival photos, finds no console to
 * read a serial from, names the mismatch against the locked card, the deal
 * moves to ISSUE, and the evidence pack carries the locked card (console and
 * box serial), the arrival photos and the mismatch in its summary.
 */
import { describe, expect, it } from "vitest";
import { EMPTY_BOX_LOCKED_SERIAL, EvidencePackSchema, emptyBox } from "@pay-pals/contracts";
import type { ArrivalCheck, EvidenceInput, EvidencePack, ItemCard } from "@pay-pals/contracts";
import { buildEvidencePack, createBuyerPal, createFixturePriceLookup } from "@pay-pals/agents";
import { driveTo, seedFixture } from "./seed";
import type { SeededDeal } from "./seed";

const buyerPal = createBuyerPal({ anthropic: null, priceLookup: createFixturePriceLookup() });

const NOT_PRESENT = "not present, box arrived empty";

interface DeliveredDeal {
  seeded: SeededDeal;
  lockedCard: ItemCard;
}

/** Review, agree and lock, pay, ship, deliver. Saves the verdict, payment and shipment along the way. */
async function deliverEmptyBox(): Promise<DeliveredDeal> {
  const seeded = await seedFixture(emptyBox);
  const { store, dealId } = seeded;

  const card = (await store.getCurrentCard(dealId))!;
  const chat = await store.listMessages(dealId, "deal");
  const { data: verdict } = await buyerPal.review(card, chat, { seller: emptyBox.seller });
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
  await seeded.store.transition(seeded.dealId, "ISSUE", "buyer_pal", "Issue opened: the box arrived empty.");
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

describe("empty-box: arrival check to evidence pack", () => {
  // Red until PLAN item 2 (builder-agents) lands: the captions now describe only what is visible
  // ("Grey foam insert inside."), so the empty-box finding has to come from the pal looking at the
  // arrival photo, not from caption words. Today the keyless pal can only say the serial is unreadable.
  it("finds no console serial, names the mismatch against the locked card, and the box label does not count", async () => {
    const delivered = await deliverEmptyBox();
    const check = await checkAndRaiseIssue(delivered);

    expect(check.matches).toBe(false);
    expect(check.cardVersion).toBe(delivered.lockedCard.version);
    const fields = check.mismatches.map((m) => m.field);
    for (const field of emptyBox.expectedArrival!.mismatchFields) expect(fields).toContain(field);
    expect(fields).toContain("other");

    const serial = check.mismatches.find((m) => m.field === "serial")!;
    expect(serial.expected).toBe(EMPTY_BOX_LOCKED_SERIAL);
    expect(serial.observed).toBe(NOT_PRESENT);
    expect(serial.explanation).toContain(EMPTY_BOX_LOCKED_SERIAL);
    expect(serial.explanation).toContain("box label");
    expect(check.observed.serial).toBeNull();

    const other = check.mismatches.find((m) => m.field === "other")!;
    expect(other.observed).toContain("Only the foam insert inside");
    expect(check.palMessage).toContain("without the item");
    expect(check.palMessage).toContain("does not count");
    expect(check.palMessage).toContain("dispute");

    const { store, dealId } = delivered.seeded;
    expect((await store.getArrivalCheck(dealId))!.matches).toBe(false);
    expect((await store.getDeal(dealId))!.state).toBe("ISSUE");
  });

  it("builds an evidence pack with the locked card, both serial fields, the arrival photos and the mismatch in the summary", async () => {
    const delivered = await deliverEmptyBox();
    await checkAndRaiseIssue(delivered);
    const input = await gatherEvidence(delivered);

    const { data: pack, palMessage } = await buildEvidencePack(input, { anthropic: null });
    expect(EvidencePackSchema.safeParse(pack).success).toBe(true);
    expect(pack.dealId).toBe(delivered.seeded.dealId);
    expect(pack.builtBy).toBe("buyer_pal");

    expect(pack.lockedCard.lockedAt).not.toBeNull();
    expect(pack.lockedCard.version).toBe(delivered.lockedCard.version);
    expect(pack.lockedCard.serial).toBe(EMPTY_BOX_LOCKED_SERIAL);
    expect(pack.lockedCard.boxSerial).toBe(EMPTY_BOX_LOCKED_SERIAL);

    const urls = pack.photos.map((p) => p.url);
    for (const photo of emptyBox.arrivalPhotos) expect(urls).toContain(photo.url);
    for (const photo of delivered.lockedCard.photos) expect(urls).toContain(photo.url);
    expect(new Set(urls).size).toBe(urls.length);

    expect(pack.summary).toContain(EMPTY_BOX_LOCKED_SERIAL);
    expect(pack.summary).toContain(NOT_PRESENT);
    expect(pack.summary).toContain(emptyBox.payment!.paypalOrderId);
    expect(pack.summary).toContain(emptyBox.shipment!.trackingNumber);
    expect(pack.summary).toContain(emptyBox.arrivalPhotos[0]!.whatItShows);
    expect(pack.arrivalCheck?.matches).toBe(false);
    expect(pack.payment?.paypalOrderId).toBe(emptyBox.payment!.paypalOrderId);
    expect(pack.shipment?.trackingNumber).toBe(emptyBox.shipment!.trackingNumber);
    expect(pack.timeline.some((e) => e.kind === "state_changed" && e.toState === "ISSUE")).toBe(true);
    expect(palMessage).toContain("dispute");
  });

  it("stores the pack and reads it back unchanged", async () => {
    const delivered = await deliverEmptyBox();
    await checkAndRaiseIssue(delivered);
    const { data: pack } = await buildEvidencePack(await gatherEvidence(delivered), { anthropic: null });
    const { store, dealId } = delivered.seeded;

    await store.saveEvidence(pack);
    const stored: EvidencePack | null = await store.getEvidence(dealId);
    expect(stored).toEqual(pack);
  });
});
