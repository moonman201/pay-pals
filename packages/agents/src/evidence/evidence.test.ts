import { describe, expect, it } from "vitest";
import type { EvidenceInput } from "@pay-pals/contracts";
import { EvidencePackSchema, WRONG_ITEM_ARRIVED_SERIAL, WRONG_ITEM_LOCKED_SERIAL, cleanGarmin, wrongItem } from "@pay-pals/contracts";
import { createBuyerPal } from "../buyer/buyer-pal";
import { createFixturePriceLookup } from "../price/fixture-lookup";
import { fakeClaude } from "../testing/fake-claude";
import { buildEvidencePack, createEvidencePackBuilder } from "./build-evidence-pack";
import { deterministicSummary } from "./summary";

async function wrongItemInput(): Promise<EvidenceInput> {
  const pal = createBuyerPal({ anthropic: null, priceLookup: createFixturePriceLookup() });
  const card = wrongItem.cards[0]!;
  const verdict = (await pal.review(card, wrongItem.chat)).data;
  const arrival = (await pal.checkArrival(card, wrongItem.arrivalPhotos)).data;
  return {
    deal: wrongItem.deal,
    lockedCard: card,
    verdicts: [verdict],
    arrivalCheck: arrival,
    messages: wrongItem.chat,
    payment: wrongItem.payment,
    shipment: wrongItem.shipment,
    timeline: wrongItem.timeline,
    arrivalPhotos: wrongItem.arrivalPhotos,
    requestedBy: "buyer",
  };
}

describe("buildEvidencePack", () => {
  it("assembles a valid pack for the wrong-item scenario with the arrival photos and a factual summary", async () => {
    const input = await wrongItemInput();
    const { data: pack, palMessage } = await buildEvidencePack(input, { anthropic: null });
    expect(EvidencePackSchema.safeParse(pack).success).toBe(true);
    expect(pack.builtBy).toBe("buyer_pal");
    expect(pack.photos.map((p) => p.url)).toEqual([
      ...wrongItem.cards[0]!.photos.map((p) => p.url),
      ...wrongItem.shipment!.packingPhotos.map((p) => p.url),
      ...wrongItem.arrivalPhotos.map((p) => p.url),
    ]);
    expect(pack.summary).toContain("2 arrival photos taken by the buyer");
    expect(pack.summary).toContain(wrongItem.arrivalPhotos[0]!.whatItShows);
    expect(pack.summary).toContain(WRONG_ITEM_LOCKED_SERIAL);
    expect(pack.summary).toContain(WRONG_ITEM_ARRIVED_SERIAL);
    expect(pack.summary).toContain(wrongItem.payment!.paypalOrderId);
    expect(pack.summary).toContain(wrongItem.shipment!.trackingNumber);
    expect(pack.summary).not.toMatch(/[—!]/);
    expect(palMessage).toContain("did not match");
    expect(palMessage).toContain("dispute");
  });

  it("does not list an arrival photo twice when it also appears in the chat", async () => {
    const input = await wrongItemInput();
    const withChatPhoto: EvidenceInput = {
      ...input,
      messages: [...input.messages, { id: "m9", dealId: input.deal.id, channel: "deal", author: "buyer", text: "This is a Fenix 6.", photos: [wrongItem.arrivalPhotos[0]!], at: input.arrivalCheck!.createdAt }],
    };
    const { data: pack } = await buildEvidencePack(withChatPhoto, { anthropic: null });
    expect(pack.photos.filter((p) => p.url === wrongItem.arrivalPhotos[0]!.url)).toHaveLength(1);
    expect(pack.photos).toHaveLength(5);
  });

  it("uses the model's prose when a client is given and tells it about the arrival photos", async () => {
    const input = await wrongItemInput();
    const model = fakeClaude(() => null);
    let prompt = "";
    model.messages.create = async (params) => {
      prompt = typeof params.messages[0]!.content === "string" ? params.messages[0]!.content : "";
      return { content: [{ type: "text", text: "The buyer paid for a Fenix 7 Pro, serial 7LP091337 — a Fenix 6 arrived!" }], stop_reason: "end_turn" } as never;
    };
    const withModel = await createEvidencePackBuilder({ anthropic: model })(input);
    expect(withModel.data.summary).toBe("The buyer paid for a Fenix 7 Pro, serial 7LP091337, a Fenix 6 arrived.");
    expect(prompt).toContain("arrival photo");
    expect(deterministicSummary(input)).toContain("did not match");
  });

  it("handles a clean deal with no arrival problems", async () => {
    const input: EvidenceInput = {
      deal: cleanGarmin.deal,
      lockedCard: cleanGarmin.cards[1]!,
      verdicts: [],
      arrivalCheck: null,
      messages: cleanGarmin.chat,
      payment: cleanGarmin.payment,
      shipment: cleanGarmin.shipment,
      timeline: cleanGarmin.timeline,
      requestedBy: "seller",
    };
    const { data: pack } = await buildEvidencePack(input, { anthropic: null });
    expect(pack.builtBy).toBe("seller_pal");
    expect(pack.photos).toHaveLength(5);
    expect(pack.summary).toContain("Payment: PayPal order FIXTURE-ORDER-CLEAN-0001");
  });
});
