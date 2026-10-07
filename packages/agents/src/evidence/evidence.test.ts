import { describe, expect, it } from "vitest";
import type { EvidenceInput } from "@pay-pals/contracts";
import { EMPTY_BOX_LOCKED_SERIAL, EvidencePackSchema, cleanPs5, emptyBox } from "@pay-pals/contracts";
import { createBuyerPal } from "../buyer/buyer-pal";
import { createFixturePriceLookup } from "../price/fixture-lookup";
import { fakeClaude } from "../testing/fake-claude";
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
    expect(pack.summary).toContain(`serial ${EMPTY_BOX_LOCKED_SERIAL}, box label serial ${EMPTY_BOX_LOCKED_SERIAL}`);
    expect(pack.summary).toContain("not present, box arrived empty");
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
    expect(deterministicSummary(input)).toContain("did not match");
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
  });
});
