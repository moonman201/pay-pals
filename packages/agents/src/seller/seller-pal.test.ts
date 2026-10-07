import { describe, expect, it } from "vitest";
import { CLEAN_SERIAL, EMPTY_BOX_LOCKED_SERIAL, FAKE_SLAB_CERT, ItemCardSchema, cleanPs5, emptyBox, fakeSlab } from "@pay-pals/contracts";
import { fakeClaude, promptText } from "../testing/fake-claude";
import { CardLockedError } from "./apply-request";
import { MissingPriceError } from "./build-card";
import { parseListing } from "./listing-parse";
import { createSellerPal } from "./seller-pal";

const buildInput = (fixture: typeof cleanPs5) => ({
  dealId: fixture.deal.id,
  listingText: fixture.listingText,
  photos: fixture.listingPhotos,
  sellerNotes: fixture.sellerNotes,
  sellerPaypalEmail: fixture.cards[0]!.sellerPaypalEmail,
});

describe("parseListing", () => {
  it("pulls brand, model, price, grade and included from the clean listing", () => {
    const draft = parseListing(cleanPs5.listingText, cleanPs5.sellerNotes);
    expect(draft.brand).toBe("Sony");
    expect(draft.model).toBe("PlayStation 5 disc edition");
    expect(draft.title).toBe("Sony PlayStation 5 disc edition");
    expect(draft.askingPrice).toBe(420);
    expect(draft.conditionGrade).toBe("good");
    expect(draft.included).toContain("DualSense controller");
    expect(draft.included).toContain("Original box");
    expect(draft.conditionNotes).toContain("scuff");
  });
  it("reads the slab listing as like new at $750 with Pokemon as the brand", () => {
    const draft = parseListing(fakeSlab.listingText, fakeSlab.sellerNotes);
    expect(draft.brand).toBe("Pokemon");
    expect(draft.model).toBe("1999 Pokemon Base Set Charizard Holo PSA 10");
    expect(draft.askingPrice).toBe(750);
    expect(draft.conditionGrade).toBe("like_new");
  });
  it("reads a PS5 listing with PS5 as the only brand word as Sony", () => {
    expect(parseListing("PS5 disc edition with original box, controller and all cables. Like new. $220 FIRM.", "")).toMatchObject({ brand: "Sony", model: "PS5 disc edition", askingPrice: 220 });
  });
  it("keeps the first word as the brand when it is one", () => {
    expect(parseListing("Bose QuietComfort 45, barely used. $150.", "")).toMatchObject({ brand: "Bose", model: "QuietComfort 45" });
  });
});

describe("SellerPal.buildCard", () => {
  it("builds version 1 with the item serial and the matching box serial from the photo descriptions", async () => {
    const pal = createSellerPal({ anthropic: null });
    const { data: card, palMessage } = await pal.buildCard(buildInput(cleanPs5));
    expect(ItemCardSchema.safeParse(card).success).toBe(true);
    expect(card.version).toBe(1);
    expect(card.lockedAt).toBeNull();
    expect(card.serial).toBe(CLEAN_SERIAL);
    expect(card.boxSerial).toBe(CLEAN_SERIAL);
    expect(card.askingPrice).toBe(420);
    expect(card.photos).toEqual(cleanPs5.listingPhotos);
    expect(palMessage).toContain(`Serial ${CLEAN_SERIAL} read from the item`);
    expect(palMessage).toContain("They match.");
    expect(palMessage).toContain("photo descriptions");
  });

  it("calls out a box label that does not match the item", async () => {
    const pal = createSellerPal({ anthropic: null });
    const photos = cleanPs5.listingPhotos.map((p) => (p.whatItShows.startsWith("Original box label") ? { ...p, whatItShows: "Original box label. Serial AH900000001." } : p));
    const { data: card, palMessage } = await pal.buildCard({ ...buildInput(cleanPs5), photos });
    expect(card.serial).toBe(CLEAN_SERIAL);
    expect(card.boxSerial).toBe("AH900000001");
    expect(palMessage).toContain("does not match the item");
  });

  it("never puts a box label serial in the item serial", async () => {
    const pal = createSellerPal({ anthropic: null });
    const boxOnly = cleanPs5.listingPhotos.filter((p) => p.whatItShows.startsWith("Original box label"));
    const { data: card, palMessage } = await pal.buildCard({ ...buildInput(cleanPs5), photos: boxOnly, sellerNotes: "" });
    expect(card.serial).toBeNull();
    expect(card.boxSerial).toBe(CLEAN_SERIAL);
    expect(palMessage).toContain("A box label is not the item");
  });

  it("uses the model's draft but never a serial the model made up", async () => {
    const model = fakeClaude((params) => {
      if (params.tools?.[0]?.name !== "draft_item_card") return null;
      return {
        title: "Sony PlayStation 5 disc edition with original box",
        brand: "Sony",
        model: "PlayStation 5 disc edition, CFI-1215A",
        condition_grade: "good",
        condition_notes: "Light scuff on the base. No marks on the console.",
        included: ["Console", "DualSense controller", "HDMI cable", "Power cable", "Original box"],
        asking_price: 420,
        serial: "FAKE123456",
      };
    });
    const pal = createSellerPal({ anthropic: model });
    const { data: card } = await pal.buildCard(buildInput(cleanPs5));
    expect(card.model).toBe("PlayStation 5 disc edition, CFI-1215A");
    expect(card.included).toHaveLength(5);
    expect(card.serial).toBe(CLEAN_SERIAL);
    expect(card.boxSerial).toBe(CLEAN_SERIAL);
    expect(promptText(model.calls[0]!)).toContain(cleanPs5.listingText);
  });

  it("reads the cert number and grade from the slab label and leaves both serials null", async () => {
    const pal = createSellerPal({ anthropic: null });
    const { data: card, palMessage } = await pal.buildCard(buildInput(fakeSlab));
    expect(ItemCardSchema.safeParse(card).success).toBe(true);
    expect(card.serial).toBeNull();
    expect(card.boxSerial).toBeNull();
    expect(card.certNumber).toBe(FAKE_SLAB_CERT);
    expect(card.grade).toBe("PSA 10");
    expect(card.askingPrice).toBe(750);
    expect(palMessage).toContain(`Cert ${FAKE_SLAB_CERT} (PSA 10) read from the slab label`);
    expect(palMessage).not.toContain("could not find a serial");
  });

  it("still asks for a serial when there is neither a serial nor a cert", async () => {
    const pal = createSellerPal({ anthropic: null });
    const { palMessage } = await pal.buildCard({ ...buildInput(cleanPs5), photos: [cleanPs5.listingPhotos[2]!], sellerNotes: "" });
    expect(palMessage).toContain("could not find a serial");
  });

  it("reads both serials with vision when the photos can be fetched", async () => {
    const model = fakeClaude((params) => {
      if (params.tools?.[0]?.name !== "report_photo_reading") return null;
      const onBox = promptText(params).includes("box label");
      return { brand: "Sony", model: "PlayStation 5", serial: `aj 204567113`, serial_on: onBox ? "packaging" : "item", item_present: true };
    });
    const pal = createSellerPal({ anthropic: model, fetchImage: async () => ({ data: "AAAA", mediaType: "image/jpeg" as const }) });
    const photos = emptyBox.listingPhotos.map((p) => ({ ...p, url: `https://example.com${p.url}`, whatItShows: p.whatItShows.startsWith("Original box label") ? "The box label." : "Back of the console." }));
    const { data: card, palMessage } = await pal.buildCard({ ...buildInput(emptyBox), photos });
    expect(card.serial).toBe(EMPTY_BOX_LOCKED_SERIAL);
    expect(card.boxSerial).toBe(EMPTY_BOX_LOCKED_SERIAL);
    expect(palMessage).toContain("They match.");
    expect(palMessage).not.toContain("photo descriptions");
  });

  it("uses the seller's typed price when the listing names none, and refuses to invent one otherwise", async () => {
    const pal = createSellerPal({ anthropic: null });
    const noPrice = { ...buildInput(cleanPs5), listingText: "PlayStation 5 disc edition, owned from new.", sellerNotes: "" };
    const { data: card } = await pal.buildCard({ ...noPrice, askingPrice: 400 });
    expect(card.askingPrice).toBe(400);
    await expect(pal.buildCard(noPrice)).rejects.toBeInstanceOf(MissingPriceError);
    await expect(pal.buildCard({ ...noPrice, askingPrice: 0 })).rejects.toBeInstanceOf(MissingPriceError);
  });

  it("prefers the price in the listing over a typed one", async () => {
    const pal = createSellerPal({ anthropic: null });
    const { data: card } = await pal.buildCard({ ...buildInput(cleanPs5), askingPrice: 999 });
    expect(card.askingPrice).toBe(420);
  });
});

describe("SellerPal.applyRequest", () => {
  const v1 = cleanPs5.cards[0]!;
  const screenPhoto = cleanPs5.cards[1]!.photos[3]!;

  it("adds the Console Information photo and a note as version 2", async () => {
    const pal = createSellerPal({ anthropic: null });
    const { data: v2, palMessage } = await pal.applyRequest(v1, { field: "photos", request: "Can you add a photo of the Console Information screen?" }, "Added. Same serial on the screen, software is current.", [screenPhoto]);
    expect(v2.version).toBe(2);
    expect(v2.lockedAt).toBeNull();
    expect(v2.photos).toHaveLength(4);
    expect(v2.photos[3]).toEqual(screenPhoto);
    expect(v2.conditionNotes).toContain("Same serial on the screen, software is current.");
    expect(v1.photos).toHaveLength(3);
    expect(palMessage).toContain("version 2");
    expect(ItemCardSchema.safeParse(v2).success).toBe(true);
  });

  it("lets the model write the card sentence", async () => {
    const model = fakeClaude(() => ({ sentence: "Console Information screen shows the same serial and current system software" }));
    const pal = createSellerPal({ anthropic: model });
    const { data: v2 } = await pal.applyRequest(v1, { field: "photos", request: "Console Information screen?" }, "Added. Same serial on the screen.", [screenPhoto]);
    expect(v2.conditionNotes.endsWith("Console Information screen shows the same serial and current system software.")).toBe(true);
  });

  it("changes the price and serial from the seller's reply, never from a box label", async () => {
    const pal = createSellerPal({ anthropic: null });
    const priced = await pal.applyRequest(v1, { field: "askingPrice", request: "Would you take 400?" }, "I can do $400.");
    expect(priced.data.askingPrice).toBe(400);
    const noSerial = { ...v1, serial: null };
    const withSerial = await pal.applyRequest(noSerial, { field: "serial", request: "What is the serial?" }, `Serial number is ${CLEAN_SERIAL}.`);
    expect(withSerial.data.serial).toBe(CLEAN_SERIAL);
    const boxPhoto = cleanPs5.listingPhotos.find((p) => p.whatItShows.startsWith("Original box label"))!;
    const fromBox = await pal.applyRequest(noSerial, { field: "serial", request: "What is the serial?" }, "Here is the box.", [boxPhoto]);
    expect(fromBox.data.serial).toBeNull();
  });

  it("throws on a locked card", async () => {
    const pal = createSellerPal({ anthropic: null });
    await expect(pal.applyRequest(cleanPs5.cards[1]!, { field: "askingPrice", request: "Lower?" }, "$400")).rejects.toBeInstanceOf(CardLockedError);
  });
});

describe("SellerPal.shipmentChecklist", () => {
  it("lists the four packing steps for a paid deal", async () => {
    const pal = createSellerPal({ anthropic: null });
    const paidDeal = { ...cleanPs5.deal, state: "PAID" as const };
    const { data: items, palMessage } = await pal.shipmentChecklist(paidDeal, cleanPs5.cards[1]!);
    expect(items.map((i) => i.id)).toEqual(["photo_packing", "photo_sealed", "tracking", "address"]);
    expect(items.every((i) => i.required && !i.done)).toBe(true);
    expect(items[0]!.label).toContain("console, dualsense controller, hdmi cable, power cable and original box");
    expect(items[3]!.label).toContain("address on the PayPal order");
    expect(palMessage).toContain(CLEAN_SERIAL);
  });
  it("adds a wait step before payment", async () => {
    const pal = createSellerPal({ anthropic: null });
    const { data: items } = await pal.shipmentChecklist({ ...cleanPs5.deal, state: "AGREED" }, cleanPs5.cards[1]!);
    expect(items[0]!.id).toBe("wait_for_payment");
  });
});
