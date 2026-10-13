import { describe, expect, it } from "vitest";
import { CLEAN_SERIAL, EMPTY_BOX_LOCKED_SERIAL, FAKE_SLAB_CERT, ItemCardSchema, cleanPs5, emptyBox, fakeSlab } from "@pay-pals/contracts";
import { CONSOLE_SERIAL_QUESTION } from "../buyer/proof-question";
import { fakeClaude, offersTool, promptText } from "../testing/fake-claude";
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

const consoleBack = cleanPs5.cards[0]!.photos[0]!;
const boxLabel = cleanPs5.cards[0]!.photos[1]!;
const included = cleanPs5.cards[0]!.photos[2]!;
const serialCloseUp = cleanPs5.cards[1]!.photos[3]!;

describe("parseListing", () => {
  it("pulls brand, model, price, grade and included from the clean listing", () => {
    const draft = parseListing(cleanPs5.listingText, cleanPs5.sellerNotes);
    expect(draft.brand).toBe("Sony");
    expect(draft.model).toBe("PlayStation 5");
    expect(draft.title).toBe("Sony PlayStation 5");
    expect(draft.askingPrice).toBe(420);
    expect(draft.conditionGrade).toBe("good");
    expect(draft.included).toContain("Blue controller");
    expect(draft.included).toContain("Stand");
    expect(draft.conditionNotes).toContain("works perfectly");
  });
  it("reads the price and the condition from the slab listing; the brand of a card like this comes from the model", () => {
    const draft = parseListing(fakeSlab.listingText, fakeSlab.sellerNotes);
    expect(draft.askingPrice).toBe(140);
    expect(draft.conditionGrade).toBe("good");
    expect(draft.title.length).toBeGreaterThan(0);
  });
  it("reads a PS5 listing with PS5 as the only brand word as Sony", () => {
    expect(parseListing(emptyBox.listingText, "")).toMatchObject({ brand: "Sony", model: "PS5 disc edition", askingPrice: 410 });
  });
  it("keeps the first word as the brand when it is one", () => {
    expect(parseListing("Bose QuietComfort 45, barely used. $150.", "")).toMatchObject({ brand: "Bose", model: "QuietComfort 45" });
  });
});

describe("SellerPal.buildCard", () => {
  it("takes the number off the box label, leaves the item serial empty and asks for the item's own label", async () => {
    const pal = createSellerPal({ anthropic: null });
    const { data: card, palMessage } = await pal.buildCard(buildInput(cleanPs5));
    expect(ItemCardSchema.safeParse(card).success).toBe(true);
    expect(card.version).toBe(1);
    expect(card.lockedAt).toBeNull();
    expect(card.serial).toBeNull();
    expect(card.boxSerial).toBe(CLEAN_SERIAL);
    expect(card.askingPrice).toBe(420);
    expect(card.photos).toEqual(cleanPs5.listingPhotos);
    expect(palMessage).toContain(`The only serial I found is on the box label (${CLEAN_SERIAL})`);
    expect(palMessage).toContain("A box label is not the item");
  });

  it("reads the item serial once the close-up is among the photos, and says the two match", async () => {
    const pal = createSellerPal({ anthropic: null });
    const { data: card, palMessage } = await pal.buildCard({ ...buildInput(cleanPs5), photos: cleanPs5.cards[1]!.photos });
    expect(card.serial).toBe(CLEAN_SERIAL);
    expect(card.boxSerial).toBe(CLEAN_SERIAL);
    expect(palMessage).toContain(`Serial ${CLEAN_SERIAL} read from the item`);
    expect(palMessage).toContain("They match.");
  });

  it("calls out a box label that does not match the item", async () => {
    const pal = createSellerPal({ anthropic: null });
    const otherBox = { ...boxLabel, whatItShows: 'Registration label on a PlayStation 5 box. It reads "Serial # for Registration" with a barcode and AJ100000001 beside it.' };
    const { data: card, palMessage } = await pal.buildCard({ ...buildInput(cleanPs5), photos: [serialCloseUp, otherBox] });
    expect(card.serial).toBe(CLEAN_SERIAL);
    expect(card.boxSerial).toBe("AJ100000001");
    expect(palMessage).toContain("does not match the item");
  });

  it("never puts a box label serial in the item serial", async () => {
    const pal = createSellerPal({ anthropic: null });
    const { data: card } = await pal.buildCard({ ...buildInput(cleanPs5), photos: [boxLabel], sellerNotes: "" });
    expect(card.serial).toBeNull();
    expect(card.boxSerial).toBe(CLEAN_SERIAL);
  });

  it("uses the model's draft but never a serial the model made up", async () => {
    const model = fakeClaude((params) => {
      if (!offersTool(params, "draft_item_card")) return null;
      return {
        title: "Sony PlayStation 5 disc edition with the original box",
        brand: "Sony",
        model: "PlayStation 5 disc edition, CFI-1015A",
        condition_grade: "good",
        condition_notes: "Bought new in 2021, smoke free home.",
        included: ["Console", "Blue DualSense controller", "HDMI cable", "Power cable", "USB cable", "Stand", "Original box"],
        asking_price: 420,
        serial: "FAKE123456",
      };
    });
    const pal = createSellerPal({ anthropic: model });
    const { data: card } = await pal.buildCard({ ...buildInput(cleanPs5), photos: cleanPs5.cards[1]!.photos });
    expect(card.model).toBe("PlayStation 5 disc edition, CFI-1015A");
    expect(card.included).toHaveLength(7);
    expect(card.serial).toBe(CLEAN_SERIAL);
    expect(card.boxSerial).toBe(CLEAN_SERIAL);
    expect(promptText(model.calls[0]!)).toContain(cleanPs5.listingText);
  });

  it("corrects a model draft that names the product family as the brand", async () => {
    const model = fakeClaude((params) => {
      if (!offersTool(params, "draft_item_card")) return null;
      return { title: "PlayStation 5 disc edition", brand: "PlayStation", model: "PS5 disc edition, CFI-1015A", condition_grade: "good", condition_notes: "Works.", included: ["Console"], asking_price: 420 };
    });
    const { data: card } = await createSellerPal({ anthropic: model }).buildCard(buildInput(cleanPs5));
    expect(card.brand).toBe("Sony");
    expect(card.model).toBe("PS5 disc edition, CFI-1015A");
  });

  it("reads the cert number and the grade off the slab label and leaves both serials null", async () => {
    const pal = createSellerPal({ anthropic: null });
    const { data: card, palMessage } = await pal.buildCard(buildInput(fakeSlab));
    expect(ItemCardSchema.safeParse(card).success).toBe(true);
    expect(card.serial).toBeNull();
    expect(card.boxSerial).toBeNull();
    expect(card.certNumber).toBe(FAKE_SLAB_CERT);
    expect(card.grade).toBe("PSA 10");
    expect(card.askingPrice).toBe(140);
    expect(palMessage).toContain(`Cert ${FAKE_SLAB_CERT} (PSA 10) read from the slab label`);
    expect(palMessage).not.toContain("could not find a serial");
  });

  it("still asks for a serial when there is neither a serial nor a cert", async () => {
    const pal = createSellerPal({ anthropic: null });
    const { palMessage } = await pal.buildCard({ ...buildInput(cleanPs5), photos: [included], sellerNotes: "" });
    expect(palMessage).toContain("could not find a serial");
  });

  it("reads both serials with vision when the photos can be fetched", async () => {
    const model = fakeClaude((params) => {
      if (!offersTool(params, "report_photo_reading")) return null;
      const onBox = promptText(params).includes("box label");
      return { brand: "Sony", model: "PlayStation 5", serial: "aj 164952580", serial_on: onBox ? "packaging" : "item", item_present: true };
    });
    const pal = createSellerPal({ anthropic: model, fetchImage: async () => ({ data: "AAAA", mediaType: "image/jpeg" as const }) });
    const photos = emptyBox.listingPhotos.map((p) => ({
      ...p,
      url: `https://example.com${p.url}`,
      whatItShows: p.whatItShows.startsWith("Registration label") ? "The box label." : "Back of the console.",
    }));
    const { data: card, palMessage } = await pal.buildCard({ ...buildInput(emptyBox), photos });
    expect(card.serial).toBe(EMPTY_BOX_LOCKED_SERIAL);
    expect(card.boxSerial).toBe(EMPTY_BOX_LOCKED_SERIAL);
    expect(palMessage).toContain("They match.");
    expect(palMessage).toContain("I looked at the 2 photos.");
    expect(palMessage).not.toContain("description");
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

  it("adds the close-up photo and a note as version 2", async () => {
    const pal = createSellerPal({ anthropic: null });
    const { data: v2, palMessage } = await pal.applyRequest(
      v1,
      { field: "photos", request: CONSOLE_SERIAL_QUESTION },
      "Here you go, that is the sticker on the back.",
      [serialCloseUp],
    );
    expect(v2.version).toBe(2);
    expect(v2.lockedAt).toBeNull();
    expect(v2.photos).toHaveLength(4);
    expect(v2.photos[3]).toEqual(serialCloseUp);
    expect(v2.conditionNotes).toContain("Here you go, that is the sticker on the back.");
    expect(v1.photos).toHaveLength(3);
    expect(palMessage).toContain("version 2");
    expect(ItemCardSchema.safeParse(v2).success).toBe(true);
  });

  it("speaks to the seller, and quotes the buyer only when a buyer asked", async () => {
    const pal = createSellerPal({ anthropic: null });
    const asked = await pal.applyRequest(v1, { field: "photos", request: CONSOLE_SERIAL_QUESTION }, "Here you go.", [serialCloseUp]);
    expect(asked.palMessage).toContain(`This answers the buyer's question: "${CONSOLE_SERIAL_QUESTION}"`);
    expect(asked.palMessage).toContain("I updated your card to version 2");
    // The seller editing their own card unprompted: no buyer question, and no stand-in quoted back.
    for (const request of ["Seller update", "seller update.", "", "   "]) {
      const { palMessage } = await pal.applyRequest(v1, { field: "askingPrice", request }, "I can do $400.");
      expect(palMessage, JSON.stringify(request)).toContain("I updated your card to version 2");
      expect(palMessage, JSON.stringify(request)).not.toMatch(/buyer asked|Seller update|question/i);
      expect(palMessage, JSON.stringify(request)).toContain("The buyer's pal will see the new version.");
    }
  });

  it("does not hand the model a placeholder as if it were the buyer's words", async () => {
    const model = fakeClaude(() => ({ sentence: "Works fine" }));
    const pal = createSellerPal({ anthropic: model });
    await pal.applyRequest(v1, { field: "conditionNotes", request: "Seller update" }, "Works fine.");
    const sent = JSON.stringify(model.calls);
    expect(sent).not.toContain("Seller update");
    expect(sent).toContain("without being asked");
  });

  it("never states a photo was added when the update carries none, keyless or with a model", async () => {
    const reply = "Added a close-up of the serial so you can match it.";
    const keyless = await createSellerPal({ anthropic: null }).applyRequest(v1, { field: "photos", request: CONSOLE_SERIAL_QUESTION }, reply);
    expect(keyless.data.photos).toHaveLength(3);
    expect(keyless.data.conditionNotes).toBe(v1.conditionNotes);
    expect(keyless.palMessage).toContain("no photo came with this update");

    // The model rewrites the claim as a fact; the card must not take it.
    const model = fakeClaude(() => ({ sentence: "The seller added a close-up photo of the serial number so buyers can match it" }));
    const withModel = await createSellerPal({ anthropic: model }).applyRequest(v1, { field: "photos", request: CONSOLE_SERIAL_QUESTION }, reply);
    expect(withModel.data.conditionNotes).toBe(v1.conditionNotes);
    expect(withModel.data.conditionNotes).not.toMatch(/close-?up|photo added/i);
    // The reply never reached the model with the photo claim in it.
    expect(JSON.stringify(model.calls)).not.toContain("Added a close-up");

    // A model that invents the claim from a harmless reply is replaced by the seller's own words.
    const inventive = fakeClaude(() => ({ sentence: "The seller added a close-up photo of the back" }));
    const harmless = await createSellerPal({ anthropic: inventive }).applyRequest(v1, { field: "conditionNotes", request: "Any scratches?" }, "No scratches, works fine.");
    expect(harmless.data.conditionNotes).toContain("Seller says: No scratches, works fine.");
    expect(harmless.data.conditionNotes).not.toMatch(/close-?up/i);
  });

  it("states a seller's free text as the seller's own words, and a photo claim stays when a photo came with it", async () => {
    const plain = await createSellerPal({ anthropic: null }).applyRequest(v1, { field: "conditionNotes", request: "Any scratches?" }, "No scratches, works fine.");
    expect(plain.data.conditionNotes.endsWith("Seller says: No scratches, works fine.")).toBe(true);
    const modelled = await createSellerPal({ anthropic: fakeClaude(() => ({ sentence: "There are no scratches" })) }).applyRequest(v1, { field: "conditionNotes", request: "Any scratches?" }, "No scratches.");
    expect(modelled.data.conditionNotes.endsWith("Seller says: There are no scratches.")).toBe(true);
    const withPhoto = await createSellerPal({ anthropic: null }).applyRequest(v1, { field: "photos", request: CONSOLE_SERIAL_QUESTION }, "Added a close-up of the serial.", [serialCloseUp]);
    expect(withPhoto.data.photos).toHaveLength(4);
    expect(withPhoto.data.conditionNotes).toContain("Seller says: A close-up of the serial.");
    expect(withPhoto.palMessage).not.toContain("no photo came");
  });

  it("lets the model write the card sentence", async () => {
    const model = fakeClaude(() => ({ sentence: "The close-up shows the serial on the back of the console" }));
    const pal = createSellerPal({ anthropic: model });
    const { data: v2 } = await pal.applyRequest(v1, { field: "photos", request: "Close-up of the serial?" }, "Here you go.", [serialCloseUp]);
    expect(v2.conditionNotes.endsWith("The close-up shows the serial on the back of the console.")).toBe(true);
  });

  it("takes the serial from the close-up photo, and the price from the reply, but never a serial from a box label", async () => {
    const pal = createSellerPal({ anthropic: null });
    const priced = await pal.applyRequest(v1, { field: "askingPrice", request: "Would you take 400?" }, "I can do $400.");
    expect(priced.data.askingPrice).toBe(400);
    const fromCloseUp = await pal.applyRequest(v1, { field: "serial", request: "What is the serial?" }, "On the sticker, see the photo.", [serialCloseUp]);
    expect(fromCloseUp.data.serial).toBe(CLEAN_SERIAL);
    const fromBox = await pal.applyRequest(v1, { field: "serial", request: "What is the serial?" }, "Here is the box.", [boxLabel]);
    expect(fromBox.data.serial).toBeNull();
    const typed = await pal.applyRequest(v1, { field: "serial", request: "What is the serial?" }, `Serial number is ${CLEAN_SERIAL}.`);
    expect(typed.data.serial).toBe(CLEAN_SERIAL);
  });

  it("puts the console serial on the new version when the buyer asked under photos", async () => {
    const pal = createSellerPal({ anthropic: null });
    expect(v1.serial).toBeNull();
    const { data: v2, palMessage } = await pal.applyRequest(
      v1,
      { field: "photos", request: CONSOLE_SERIAL_QUESTION },
      "Here you go, that is the sticker on the back.",
      [serialCloseUp],
    );
    expect(v2.serial).toBe(CLEAN_SERIAL);
    expect(v2.boxSerial).toBe(v1.boxSerial);
    expect(palMessage).toContain(`serial ${CLEAN_SERIAL} read off the item`);
  });

  it("reads the close-up with vision when the image loads", async () => {
    const model = fakeClaude((params) =>
      offersTool(params, "report_photo_reading")
        ? { brand: "Sony", model: "PlayStation 5", serial: "aj 164952580", serial_on: "item", item_present: true }
        : { sentence: "Close-up of the serial sticker on the back of the console" },
    );
    const pal = createSellerPal({ anthropic: model, fetchImage: async () => ({ data: "AAAA", mediaType: "image/jpeg" as const }) });
    const hosted = { ...serialCloseUp, url: `https://example.com${serialCloseUp.url}`, whatItShows: "Back of the console." };
    const { data: v2 } = await pal.applyRequest(v1, { field: "photos", request: "Close-up of the serial?" }, "Here you go.", [hosted]);
    expect(v2.serial).toBe(CLEAN_SERIAL);
  });

  it("never lets a photo change a serial the card already has", async () => {
    const pal = createSellerPal({ anthropic: null });
    const withSerial = { ...v1, serial: "AJ100000001", boxSerial: null };
    const fromBox = await pal.applyRequest(withSerial, { field: "photos", request: "Can you show the box?" }, "Here is the box.", [boxLabel]);
    expect(fromBox.data.serial).toBe("AJ100000001");
    expect(fromBox.data.boxSerial).toBe(CLEAN_SERIAL);
    expect(fromBox.palMessage).toContain(`box label serial ${CLEAN_SERIAL} added`);

    const otherUnit = await pal.applyRequest(withSerial, { field: "photos", request: "Close-up of the serial?" }, "Attached.", [serialCloseUp]);
    expect(otherUnit.data.serial).toBe("AJ100000001");
    expect(otherUnit.palMessage).toContain(`The new photo reads serial ${CLEAN_SERIAL} and the card says AJ100000001`);
  });

  it("reads a cert off a slab photo and keeps one the card already carries", async () => {
    const pal = createSellerPal({ anthropic: null });
    const slabFront = fakeSlab.cards[0]!.photos[0]!;
    const plain = { ...v1, certNumber: null, grade: null };
    const { data: graded } = await pal.applyRequest(plain, { field: "photos", request: "Can you show the label?" }, "Attached.", [slabFront]);
    expect(graded.certNumber).toBe(FAKE_SLAB_CERT);
    expect(graded.grade).toBe("GEM MT 10");
    const { data: kept } = await pal.applyRequest({ ...plain, certNumber: "99999999", grade: "PSA 9" }, { field: "photos", request: "Label?" }, "Attached.", [slabFront]);
    expect(kept.certNumber).toBe("99999999");
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
    expect(items[0]!.label).toContain("console, blue dualsense controller");
    expect(items[0]!.label).toContain("stand and original box");
    expect(items[3]!.label).toContain("address on the PayPal order");
    expect(palMessage).toContain(CLEAN_SERIAL);
  });
  it("adds a wait step before payment", async () => {
    const pal = createSellerPal({ anthropic: null });
    const { data: items } = await pal.shipmentChecklist({ ...cleanPs5.deal, state: "AGREED" }, cleanPs5.cards[1]!);
    expect(items[0]!.id).toBe("wait_for_payment");
  });
});
