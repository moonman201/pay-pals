import { describe, expect, it } from "vitest";
import { CLEAN_SERIAL, ItemCardSchema, cleanGarmin, scamGarmin, wrongItem } from "@pay-pals/contracts";
import { fakeClaude, promptText } from "../testing/fake-claude";
import { CardLockedError } from "./apply-request";
import { MissingPriceError } from "./build-card";
import { parseListing } from "./listing-parse";
import { createSellerPal } from "./seller-pal";

const buildInput = (fixture: typeof cleanGarmin) => ({
  dealId: fixture.deal.id,
  listingText: fixture.listingText,
  photos: fixture.listingPhotos,
  sellerNotes: fixture.sellerNotes,
  sellerPaypalEmail: fixture.cards[0]!.sellerPaypalEmail,
});

describe("parseListing", () => {
  it("pulls brand, model, price, grade and included from the clean listing", () => {
    const draft = parseListing(cleanGarmin.listingText, cleanGarmin.sellerNotes);
    expect(draft.brand).toBe("Garmin");
    expect(draft.model).toBe("Fenix 7 Pro Sapphire Solar");
    expect(draft.askingPrice).toBe(475);
    expect(draft.conditionGrade).toBe("good");
    expect(draft.included).toEqual(["Charger", "Box"]);
    expect(draft.conditionNotes).toContain("scuff");
  });
  it("reads the scam listing as like new at $180", () => {
    const draft = parseListing(scamGarmin.listingText, scamGarmin.sellerNotes);
    expect(draft.askingPrice).toBe(180);
    expect(draft.conditionGrade).toBe("like_new");
  });
});

describe("SellerPal.buildCard", () => {
  it("builds version 1 with the serial read from the caseback description when no model is set", async () => {
    const pal = createSellerPal({ anthropic: null });
    const { data: card, palMessage } = await pal.buildCard(buildInput(cleanGarmin));
    expect(ItemCardSchema.safeParse(card).success).toBe(true);
    expect(card.version).toBe(1);
    expect(card.lockedAt).toBeNull();
    expect(card.serial).toBe(CLEAN_SERIAL);
    expect(card.askingPrice).toBe(475);
    expect(card.photos).toEqual(cleanGarmin.listingPhotos);
    expect(palMessage).toContain(CLEAN_SERIAL);
    expect(palMessage).toContain("photo descriptions");
  });

  it("uses the model's draft but never a serial the model made up", async () => {
    const model = fakeClaude((params) => {
      if (params.tools?.[0]?.name !== "draft_item_card") return null;
      return {
        title: "Garmin Fenix 7 Pro Sapphire Solar 47mm",
        brand: "Garmin",
        model: "Fenix 7 Pro Sapphire Solar 47mm",
        condition_grade: "good",
        condition_notes: "Light scuff on the bezel. Glass is perfect.",
        included: ["Watch", "Charger", "Box"],
        asking_price: 475,
        serial: "FAKE123456",
      };
    });
    const pal = createSellerPal({ anthropic: model });
    const { data: card } = await pal.buildCard(buildInput(cleanGarmin));
    expect(card.model).toBe("Fenix 7 Pro Sapphire Solar 47mm");
    expect(card.included).toEqual(["Watch", "Charger", "Box"]);
    expect(card.serial).toBe(CLEAN_SERIAL);
    expect(promptText(model.calls[0]!)).toContain(cleanGarmin.listingText);
  });

  it("leaves the serial null for the scam listing and says so", async () => {
    const pal = createSellerPal({ anthropic: null });
    const { data: card, palMessage } = await pal.buildCard(buildInput(scamGarmin));
    expect(card.serial).toBeNull();
    expect(card.askingPrice).toBe(180);
    expect(palMessage).toContain("could not find a serial");
  });

  it("reads the serial with vision when the photo can be fetched", async () => {
    const model = fakeClaude((params) => (params.tools?.[0]?.name === "report_photo_reading" ? { brand: "Garmin", model: "Fenix 7 Pro", serial: "7LP 091337" } : null));
    const pal = createSellerPal({ anthropic: model, fetchImage: async () => ({ data: "AAAA", mediaType: "image/jpeg" as const }) });
    const photos = wrongItem.listingPhotos.map((p) => ({ ...p, url: `https://example.com${p.url}`, whatItShows: "Back of the watch." }));
    const { data: card } = await pal.buildCard({ ...buildInput(wrongItem), photos });
    expect(card.serial).toBe("7LP091337");
  });

  it("uses the seller's typed price when the listing names none, and refuses to invent one otherwise", async () => {
    const pal = createSellerPal({ anthropic: null });
    const noPrice = { ...buildInput(cleanGarmin), listingText: "Garmin Fenix 7 Pro, worn daily.", sellerNotes: "" };
    const { data: card } = await pal.buildCard({ ...noPrice, askingPrice: 450 });
    expect(card.askingPrice).toBe(450);
    await expect(pal.buildCard(noPrice)).rejects.toBeInstanceOf(MissingPriceError);
    await expect(pal.buildCard({ ...noPrice, askingPrice: 0 })).rejects.toBeInstanceOf(MissingPriceError);
  });

  it("prefers the price in the listing over a typed one", async () => {
    const pal = createSellerPal({ anthropic: null });
    const { data: card } = await pal.buildCard({ ...buildInput(cleanGarmin), askingPrice: 999 });
    expect(card.askingPrice).toBe(475);
  });
});

describe("SellerPal.applyRequest", () => {
  const v1 = cleanGarmin.cards[0]!;
  const battery = cleanGarmin.cards[1]!.photos[2]!;

  it("adds the battery photo and a note as version 2", async () => {
    const pal = createSellerPal({ anthropic: null });
    const { data: v2, palMessage } = await pal.applyRequest(v1, { field: "photos", request: "Can you add a photo of the battery page?" }, "Added. About 11 days in smartwatch mode.", [battery]);
    expect(v2.version).toBe(2);
    expect(v2.lockedAt).toBeNull();
    expect(v2.photos).toHaveLength(3);
    expect(v2.photos[2]).toEqual(battery);
    expect(v2.conditionNotes).toContain("About 11 days in smartwatch mode.");
    expect(v1.photos).toHaveLength(2);
    expect(palMessage).toContain("version 2");
    expect(ItemCardSchema.safeParse(v2).success).toBe(true);
  });

  it("lets the model write the card sentence", async () => {
    const model = fakeClaude(() => ({ sentence: "Battery holds about 11 days in smartwatch mode" }));
    const pal = createSellerPal({ anthropic: model });
    const { data: v2 } = await pal.applyRequest(v1, { field: "photos", request: "Battery page?" }, "Added. About 11 days in smartwatch mode.", [battery]);
    expect(v2.conditionNotes.endsWith("Battery holds about 11 days in smartwatch mode.")).toBe(true);
  });

  it("changes the price and serial from the seller's reply", async () => {
    const pal = createSellerPal({ anthropic: null });
    const priced = await pal.applyRequest(v1, { field: "askingPrice", request: "Would you take 450?" }, "I can do $450.");
    expect(priced.data.askingPrice).toBe(450);
    const noSerial = { ...v1, serial: null };
    const withSerial = await pal.applyRequest(noSerial, { field: "serial", request: "What is the serial?" }, "Serial number is 7LP045912.");
    expect(withSerial.data.serial).toBe(CLEAN_SERIAL);
  });

  it("throws on a locked card", async () => {
    const pal = createSellerPal({ anthropic: null });
    await expect(pal.applyRequest(cleanGarmin.cards[1]!, { field: "askingPrice", request: "Lower?" }, "$400")).rejects.toBeInstanceOf(CardLockedError);
  });
});

describe("SellerPal.shipmentChecklist", () => {
  it("lists the four packing steps for a paid deal", async () => {
    const pal = createSellerPal({ anthropic: null });
    const paidDeal = { ...cleanGarmin.deal, state: "PAID" as const };
    const { data: items, palMessage } = await pal.shipmentChecklist(paidDeal, cleanGarmin.cards[1]!);
    expect(items.map((i) => i.id)).toEqual(["photo_packing", "photo_sealed", "tracking", "address"]);
    expect(items.every((i) => i.required && !i.done)).toBe(true);
    expect(items[0]!.label).toContain("watch, charging cable and original box");
    expect(items[3]!.label).toContain("address on the PayPal order");
    expect(palMessage).toContain(CLEAN_SERIAL);
  });
  it("adds a wait step before payment", async () => {
    const pal = createSellerPal({ anthropic: null });
    const { data: items } = await pal.shipmentChecklist({ ...cleanGarmin.deal, state: "AGREED" }, cleanGarmin.cards[1]!);
    expect(items[0]!.id).toBe("wait_for_payment");
  });
});
