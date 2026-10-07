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
    messages: [...wrongItem.chat, { id: "m9", dealId: card.dealId, channel: "deal", author: "buyer", text: "This is a Fenix 6.", photos: wrongItem.arrivalPhotos, at: arrival.createdAt }],
    payment: wrongItem.payment,
    shipment: wrongItem.shipment,
    timeline: wrongItem.timeline,
    requestedBy: "buyer",
  };
}

describe("buildEvidencePack", () => {
  it("assembles a valid pack for the wrong-item scenario with a factual summary", async () => {
    const input = await wrongItemInput();
    const { data: pack, palMessage } = await buildEvidencePack(input, { anthropic: null });
    expect(EvidencePackSchema.safeParse(pack).success).toBe(true);
    expect(pack.builtBy).toBe("buyer_pal");
    expect(pack.photos.map((p) => p.url)).toEqual([
      ...wrongItem.cards[0]!.photos.map((p) => p.url),
      ...wrongItem.arrivalPhotos.map((p) => p.url),
      ...wrongItem.shipment!.packingPhotos.map((p) => p.url),
    ]);
    expect(pack.summary).toContain(WRONG_ITEM_LOCKED_SERIAL);
    expect(pack.summary).toContain(WRONG_ITEM_ARRIVED_SERIAL);
    expect(pack.summary).toContain(wrongItem.payment!.paypalOrderId);
    expect(pack.summary).toContain(wrongItem.shipment!.trackingNumber);
    expect(pack.summary).not.toMatch(/[—!]/);
    expect(palMessage).toContain("did not match");
    expect(palMessage).toContain("dispute");
  });

  it("uses the model's prose when a client is given and falls back when it is not", async () => {
    const input = await wrongItemInput();
    const model = fakeClaude(() => null);
    model.messages.create = async () =>
      ({ content: [{ type: "text", text: "The buyer paid for a Fenix 7 Pro, serial 7LP091337 — a Fenix 6 arrived!" }], stop_reason: "end_turn" }) as never;
    const withModel = await createEvidencePackBuilder({ anthropic: model })(input);
    expect(withModel.data.summary).toBe("The buyer paid for a Fenix 7 Pro, serial 7LP091337, a Fenix 6 arrived.");
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
