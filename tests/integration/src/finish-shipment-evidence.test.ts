/**
 * Contracts v1.6.0 (branch finish): the Buyer Pal checks the shipment at
 * ship time, the shipment carries the flags it raised, and the evidence pack
 * names the questions the seller never answered and the packing photo the
 * seller shipped without. Empty box has one of each; the clean deal has
 * neither. Real rules-only pals, the memory store, no network.
 */
import { describe, expect, it } from "vitest";
import { EvidencePackSchema, ShipmentSchema, cleanPs5, emptyBox } from "@pay-pals/contracts";
import type { EvidenceInput, RedFlag, ScenarioFixture, Shipment } from "@pay-pals/contracts";
import { buildEvidencePack, createBuyerPal, createFixtureCertLookup, createFixturePriceLookup } from "@pay-pals/agents";
import { createMemoryDealStore, createReplayClock } from "@pay-pals/db";
import { driveTo, seedFixture } from "./seed";
import type { SeededDeal } from "./seed";

const buyerPal = createBuyerPal({ anthropic: null, priceLookup: createFixturePriceLookup(), certLookup: createFixtureCertLookup() });

/** The question the fixture's Buyer Pal asked on the deal channel, as the pack reports it (the "Buyer Pal to seller:" prefix dropped). */
const EMPTY_BOX_QUESTION = "Can you add a photo of the Console Information screen showing the serial?";

interface Delivered {
  seeded: SeededDeal;
  shipment: Shipment;
  flags: RedFlag[];
}

/**
 * Review, agree and lock, pay, ship with the Buyer Pal's shipment check saved
 * on the shipment, deliver. The store runs on a replay clock set to the
 * fixture's payment time, so the seeded chat (which keeps the fixture's
 * dates) sits before the payment the way the scenario tells it.
 */
async function deliverWithShipmentCheck(fixture: ScenarioFixture): Promise<Delivered> {
  const time = createReplayClock(fixture.payment!.createdAt);
  const seeded = await seedFixture(fixture, createMemoryDealStore({ clock: time.clock }));
  const { store, dealId } = seeded;
  const card = (await store.getCurrentCard(dealId))!;
  const { data: verdict } = await buyerPal.review(card, await store.listMessages(dealId, "deal"), { dealId, seller: fixture.seller, sellerJoined: true });
  await store.saveVerdict(verdict);
  await driveTo(seeded, "AGREED");
  const locked = await store.lockCard(dealId, card.version);
  await store.transition(dealId, "PAYMENT_PENDING", "system", "Payment pending.");
  await store.appendEvent({ dealId, kind: "payment_created", actor: "paypal", summary: "PayPal checkout order created.", at: time.now() });
  await store.savePayment({ ...seeded.payment!, paypalOrderId: "5O190127TN364715T" });
  await store.transition(dealId, "PAID", "system", "Paid.");

  const { data: flags, palMessage } = await buyerPal.checkShipment(locked, seeded.shipment!);
  const shipment = await store.saveShipment({ ...seeded.shipment!, flags });
  await store.transition(dealId, "SHIPPED", "seller", "Shipped.");
  if (flags.length > 0) {
    await store.appendEvent({ dealId, kind: "shipment_checked", actor: "buyer_pal", summary: palMessage.slice(0, 300), data: { flags: flags.map((f) => f.code) }, at: time.now() });
  }
  await store.transition(dealId, "DELIVERED", "buyer", "Delivered.");
  return { seeded, shipment, flags };
}

async function evidenceInput(delivered: Delivered): Promise<EvidenceInput> {
  const { store, dealId } = delivered.seeded;
  const deal = (await store.getDeal(dealId))!;
  return {
    deal,
    lockedCard: (await store.getCard(dealId, deal.lockedCardVersion!))!,
    verdicts: await store.listVerdicts(dealId),
    arrivalCheck: null,
    messages: await store.listMessages(dealId),
    payment: await store.getPayment(dealId),
    shipment: await store.getShipment(dealId),
    timeline: await store.listEvents(dealId),
    arrivalPhotos: [],
    requestedBy: "buyer",
  };
}

describe("empty-box: the shipment check and the evidence pack", () => {
  it("checkShipment on the fixture shipment yields exactly the fixture's flag", async () => {
    const { data: flags, palMessage } = await buyerPal.checkShipment(emptyBox.cards[0]!, emptyBox.shipment!);
    expect(flags).toEqual(emptyBox.shipment!.flags);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ code: "MISSING_PACKING_PHOTO", severity: "caution", raisedByRule: true });
    expect(flags[0]!.evidence).toContain("Photo of the console, controller and cables going into the box");
    expect(palMessage).toContain("One required packing step is missing");
  });

  it("the flags ride on the shipment through the store and the shipment_checked event follows", async () => {
    const delivered = await deliverWithShipmentCheck(emptyBox);
    const { store, dealId } = delivered.seeded;
    const stored = (await store.getShipment(dealId))!;
    expect(ShipmentSchema.safeParse(stored).success).toBe(true);
    expect(stored.flags).toEqual(emptyBox.shipment!.flags);
    expect(stored.flags).toEqual(delivered.flags);
    const checked = (await store.listEvents(dealId)).filter((e) => e.kind === "shipment_checked");
    expect(checked).toHaveLength(1);
    expect(checked[0]!.data).toMatchObject({ flags: ["MISSING_PACKING_PHOTO"] });
    expect(checked[0]!.actor).toBe("buyer_pal");
  });

  it("the evidence pack carries one unanswered question and one shipment flag, and the summary names both", async () => {
    const delivered = await deliverWithShipmentCheck(emptyBox);
    const { data: pack, palMessage } = await buildEvidencePack(await evidenceInput(delivered), { anthropic: null });
    expect(EvidencePackSchema.safeParse(pack).success).toBe(true);

    expect(pack.unansweredQuestions).toEqual([EMPTY_BOX_QUESTION]);
    expect(pack.shipmentFlags).toEqual(emptyBox.shipment!.flags);
    expect(pack.shipmentFlags).toHaveLength(1);

    expect(pack.summary).toContain(EMPTY_BOX_QUESTION);
    expect(pack.summary).toMatch(/packing photo|going into the box/i);
    expect(palMessage).toContain("never answered one question");
    expect(palMessage).toContain("shipped without the required packing photo");
  });
});

describe("clean-ps5: nothing was left unanswered or unphotographed", () => {
  it("checkShipment yields no flag and the pack carries no unanswered question", async () => {
    const { data: flags } = await buyerPal.checkShipment(cleanPs5.cards.at(-1)!, cleanPs5.shipment!);
    expect(flags).toEqual([]);

    const delivered = await deliverWithShipmentCheck(cleanPs5);
    expect((await delivered.seeded.store.getShipment(delivered.seeded.dealId))!.flags).toEqual([]);
    expect((await delivered.seeded.store.listEvents(delivered.seeded.dealId)).some((e) => e.kind === "shipment_checked")).toBe(false);

    const { data: pack, palMessage } = await buildEvidencePack(await evidenceInput(delivered), { anthropic: null });
    expect(pack.unansweredQuestions).toEqual([]);
    expect(pack.shipmentFlags).toEqual([]);
    expect(palMessage).not.toMatch(/never answered|shipped without/);
  });
});

describe("shipment flags round-trip through the memory store", () => {
  it("saveShipment keeps the flags exactly and a later save without them clears them", async () => {
    const seeded = await seedFixture(emptyBox);
    await driveTo(seeded, "PAID");
    const { store, dealId } = seeded;
    const withFlags: Shipment = { ...seeded.shipment!, flags: emptyBox.shipment!.flags };
    await store.saveShipment(withFlags);
    const read = (await store.getShipment(dealId))!;
    expect(read.flags).toEqual(emptyBox.shipment!.flags);
    expect(read).toEqual(withFlags);

    await store.saveShipment({ ...withFlags, deliveredAt: new Date().toISOString() });
    expect((await store.getShipment(dealId))!.flags).toEqual(emptyBox.shipment!.flags);

    const { flags: _dropped, ...withoutFlags } = withFlags;
    await store.saveShipment(withoutFlags);
    expect((await store.getShipment(dealId))!.flags ?? []).toEqual([]);
  });
});
