import { describe, expect, it } from "vitest";
import type { EvidenceInput } from "@pay-pals/contracts";
import { EMPTY_BOX_LOCKED_SERIAL, EvidencePackSchema, FAKE_SLAB_CERT, cleanPs5, emptyBox, fakeSlab } from "@pay-pals/contracts";
import { createBuyerPal } from "../buyer/buyer-pal";
import { createFixtureCertLookup } from "../cert/fixture-lookup";
import { createFixturePriceLookup } from "../price/fixture-lookup";
import { fakeClaude } from "../testing/fake-claude";
import { fixtureQuestion } from "../testing/fixture-question";
import { buildEvidencePack, createEvidencePackBuilder } from "./build-evidence-pack";
import { deterministicSummary } from "./summary";

async function emptyBoxInput(): Promise<EvidenceInput> {
  const pal = createBuyerPal({ anthropic: null, priceLookup: createFixturePriceLookup() });
  const card = emptyBox.cards[0]!;
  const verdict = (await pal.review(card, emptyBox.chat)).data;
  const arrival = (await pal.checkArrival(card, emptyBox.arrivalPhotos)).data;
  return {
    deal: emptyBox.deal,
    lockedCard: card,
    verdicts: [verdict],
    arrivalCheck: arrival,
    messages: emptyBox.chat,
    payment: emptyBox.payment,
    shipment: emptyBox.shipment,
    timeline: emptyBox.timeline,
    arrivalPhotos: emptyBox.arrivalPhotos,
    requestedBy: "buyer",
  };
}

describe("buildEvidencePack", () => {
  it("assembles a valid pack for the empty-box scenario with the arrival photos and a factual summary", async () => {
    const input = await emptyBoxInput();
    const { data: pack, palMessage } = await buildEvidencePack(input, { anthropic: null });
    expect(EvidencePackSchema.safeParse(pack).success).toBe(true);
    expect(pack.builtBy).toBe("buyer_pal");
    expect(pack.photos.map((p) => p.url)).toEqual([
      ...emptyBox.cards[0]!.photos.map((p) => p.url),
      ...emptyBox.shipment!.packingPhotos.map((p) => p.url),
      ...emptyBox.arrivalPhotos.map((p) => p.url),
    ]);
    expect(pack.summary).toContain("2 arrival photos taken by the buyer");
    expect(pack.summary).toContain(emptyBox.arrivalPhotos[0]!.whatItShows);
    expect(pack.summary).toContain(`serial none recorded, box label serial ${EMPTY_BOX_LOCKED_SERIAL}`);
    expect(pack.summary).toContain("other: card says Sony PlayStation 5 disc edition");
    expect(pack.summary).toContain("nothing in the box but packaging");
    expect(pack.summary).toContain("4 shared chat messages, 0 pal messages and");
    expect(palMessage).toContain("4 shared chat messages,");
    const withPal = await buildEvidencePack({ ...input, messages: [...input.messages, { ...input.messages[0]!, id: "p1", channel: "buyer_pal", author: "buyer_pal", text: "Looks fine." }, { ...input.messages[0]!, id: "p2", channel: "seller_pal", author: "seller_pal", text: "Card built." }] }, { anthropic: null });
    expect(withPal.data.summary).toContain("4 shared chat messages, 2 pal messages and");
    expect(withPal.palMessage).toContain("4 shared chat messages and 2 pal messages,");

    // Scenario 3: the unanswered question and the ship-time flag are both in the pack and the summary.
    const asked = fixtureQuestion(emptyBox.chat);
    expect(pack.unansweredQuestions).toEqual([asked]);
    expect(pack.shipmentFlags).toEqual(emptyBox.shipment!.flags);
    expect(pack.summary).toContain(`The Buyer Pal asked the seller before payment: "${asked}" The seller never answered.`);
    expect(pack.summary).toContain("At ship time the Buyer Pal raised MISSING_PACKING_PHOTO (caution): The seller shipped without the photo of the item going into the box, so there is no proof of what was packed.");
    expect(palMessage).toContain("The seller never answered one question the Buyer Pal asked before payment.");
    expect(palMessage).toContain("The seller shipped without the required packing photo.");
    expect(pack.summary).toContain(emptyBox.payment!.paypalOrderId);
    expect(pack.summary).toContain(emptyBox.shipment!.trackingNumber);
    expect(pack.summary).not.toMatch(/[—!]/);
    expect(palMessage).toContain("did not match");
    expect(palMessage).toContain("dispute");
  });

  it("does not list an arrival photo twice when it also appears in the chat", async () => {
    const input = await emptyBoxInput();
    const withChatPhoto: EvidenceInput = {
      ...input,
      messages: [...input.messages, { id: "m9", dealId: input.deal.id, channel: "deal", author: "buyer", text: "The box is empty.", photos: [emptyBox.arrivalPhotos[0]!], at: input.arrivalCheck!.createdAt }],
    };
    const { data: pack } = await buildEvidencePack(withChatPhoto, { anthropic: null });
    expect(pack.photos.filter((p) => p.url === emptyBox.arrivalPhotos[0]!.url)).toHaveLength(1);
    expect(pack.photos).toHaveLength(5);
  });

  it("uses the model's prose when a client is given and tells it about the arrival photos", async () => {
    const input = await emptyBoxInput();
    const model = fakeClaude(() => null);
    let prompt = "";
    model.messages.create = async (params) => {
      prompt = typeof params.messages[0]!.content === "string" ? params.messages[0]!.content : "";
      return { content: [{ type: "text", text: `The buyer paid for a PlayStation 5, serial ${EMPTY_BOX_LOCKED_SERIAL} — an empty box arrived!` }], stop_reason: "end_turn" } as never;
    };
    const withModel = await createEvidencePackBuilder({ anthropic: model })(input);
    expect(withModel.data.summary).toBe(`The buyer paid for a PlayStation 5, serial ${EMPTY_BOX_LOCKED_SERIAL}, an empty box arrived.`);
    expect(prompt).toContain("arrival photo");
    expect(prompt).toContain("never got an answer");
    expect(prompt).toContain("The seller never answered.");
    expect(prompt).toContain("MISSING_PACKING_PHOTO");
    expect(deterministicSummary(input)).toContain("did not match");
  });

  it("records the history hash from the payment and whether the stored events reproduce it", async () => {
    const input = await emptyBoxInput();
    const paidEvent = input.timeline.find((e) => e.kind === "payment_created")!;
    const verified = await buildEvidencePack({ ...input, payment: { ...input.payment!, historyHash: paidEvent.hash } }, { anthropic: null });
    expect(verified.data.historyHash).toBe(paidEvent.hash);
    expect(verified.data.historyVerified).toBe(true);
    // Corrected on 2026-10-10 with the tamper sentence itself. These assertions used to require the
    // pack to say PayPal's record corroborated the hash, which nothing on EvidenceInput can support.
    expect(verified.data.summary).toContain(`The hash is ${paidEvent.hash}.`);
    expect(verified.data.summary).toContain("reproduce the hash recorded with this payment");
    expect(verified.data.summary).toContain("has not been checked for this pack");
    expect(verified.palMessage).toContain("Whether PayPal's copy of that hash matches has not been checked for this pack.");
    expect(verified.palMessage).not.toContain("official record of the deal that PayPal can check first");
    expect(EvidencePackSchema.safeParse(verified.data).success).toBe(true);

    const tampered = await buildEvidencePack({ ...input, payment: { ...input.payment!, historyHash: "a".repeat(64) } }, { anthropic: null });
    expect(tampered.data.historyVerified).toBe(false);
    expect(tampered.data.summary).toContain("do not reproduce the hash recorded with this payment");
    expect(tampered.palMessage).not.toContain("what PayPal holds");

    const none = await buildEvidencePack({ ...input, payment: { ...input.payment!, historyHash: null } }, { anthropic: null });
    expect(none.data.historyHash).toBeUndefined();
    expect(none.data.historyVerified).toBeUndefined();
  });

  it("mentions the grading cert check for a slab", async () => {
    const pal = createBuyerPal({ anthropic: null, priceLookup: createFixturePriceLookup(), certLookup: createFixtureCertLookup() });
    const card = fakeSlab.cards[0]!;
    const verdict = (await pal.review(card, fakeSlab.chat)).data;
    const input: EvidenceInput = {
      deal: fakeSlab.deal,
      lockedCard: card,
      verdicts: [verdict],
      arrivalCheck: null,
      messages: fakeSlab.chat,
      payment: null,
      shipment: null,
      timeline: fakeSlab.timeline,
      requestedBy: "buyer",
    };
    const { data: pack } = await buildEvidencePack(input, { anthropic: null });
    expect(pack.summary).toContain(`The card carries grading cert ${FAKE_SLAB_CERT}, grade PSA 10.`);
    expect(pack.summary).toContain("Grading cert check: PSA (demo record) has a record for cert");
    expect(pack.summary).toContain("2018 P.M. JPN. SUN & MOON GENGAR & MIMIKYU GX TAG BOLT #038");
  });

  it("handles a clean deal with no arrival problems", async () => {
    const input: EvidenceInput = {
      deal: cleanPs5.deal,
      lockedCard: cleanPs5.cards[1]!,
      verdicts: [],
      arrivalCheck: null,
      messages: cleanPs5.chat,
      payment: cleanPs5.payment,
      shipment: cleanPs5.shipment,
      timeline: cleanPs5.timeline,
      requestedBy: "seller",
    };
    const { data: pack } = await buildEvidencePack(input, { anthropic: null });
    expect(pack.builtBy).toBe("seller_pal");
    expect(pack.photos).toHaveLength(6);
    expect(pack.summary).toContain("Payment: PayPal order FIXTURE-ORDER-CLEAN-0001");
    expect(pack.unansweredQuestions).toEqual([]);
    expect(pack.shipmentFlags).toEqual([]);
    expect(pack.summary).not.toContain("never answered");
    expect(pack.summary).not.toContain("At ship time");
  });
});
