import { afterEach, describe, expect, it } from "vitest";
import { CLEAN_SERIAL, EMPTY_BOX_LOCKED_SERIAL, cleanPs5, emptyBox } from "@pay-pals/contracts";
import { createBuyerPal } from "./buyer/buyer-pal";
import { createSellerPal } from "./seller/seller-pal";
import { createFixturePriceLookup } from "./price/fixture-lookup";
import { isPublicMode } from "./presentation";
import { fakeClaude, promptText } from "./testing/fake-claude";
import { asFetched, pictureA } from "./testing/images";

const priceLookup = createFixturePriceLookup();
const LOADING = /could not be loaded|photo description|vision model was not available/;
const quiet = () => ({ additional_flags: [], severity_raises: [], explanations: [], questions_for_seller: [], pal_message: "Price is fair." });

afterEach(() => {
  delete process.env.PAY_PALS_PUBLIC_MODE;
});

describe("isPublicMode", () => {
  it("defaults to the env flag and lets the option override it", () => {
    expect(isPublicMode()).toBe(false);
    process.env.PAY_PALS_PUBLIC_MODE = "1";
    expect(isPublicMode()).toBe(true);
    expect(isPublicMode(false)).toBe(false);
    delete process.env.PAY_PALS_PUBLIC_MODE;
    expect(isPublicMode(true)).toBe(true);
  });
});

describe("public mode is presentation only", () => {
  it("arrival check: same decision, no loading sentence when nothing was read, the looked-at sentence kept when it was", async () => {
    const normal = await createBuyerPal({ anthropic: null, priceLookup }).checkArrival(emptyBox.cards[0]!, emptyBox.arrivalPhotos);
    const pub = await createBuyerPal({ anthropic: null, priceLookup, publicMode: true }).checkArrival(emptyBox.cards[0]!, emptyBox.arrivalPhotos);
    expect(normal.palMessage).toMatch(LOADING);
    expect(pub.palMessage).not.toMatch(LOADING);
    expect(pub.data.outcome).toBe(normal.data.outcome);
    expect(pub.data.mismatches).toEqual(normal.data.mismatches);
    expect(pub.palMessage).toContain(`The box label shows ${EMPTY_BOX_LOCKED_SERIAL}, which does not count`);

    const model = fakeClaude(() => ({ brand: null, model: null, serial: null, serial_on: null, item_present: null }));
    const notLoaded = await createBuyerPal({ anthropic: model, priceLookup, publicMode: true, fetchImage: async () => null, photoBaseUrl: "https://pay-pals.example" }).checkArrival(cleanPs5.cards[1]!, cleanPs5.arrivalPhotos);
    expect(notLoaded.palMessage).not.toMatch(LOADING);
    expect(notLoaded.palMessage).not.toContain("I looked at");

    const read = fakeClaude(() => ({ brand: "Sony", model: "PlayStation 5", serial: CLEAN_SERIAL, serial_on: "item", item_present: true }));
    const looked = await createBuyerPal({ anthropic: read, priceLookup, publicMode: true, fetchImage: async () => asFetched(pictureA()), photoBaseUrl: "https://pay-pals.example" }).checkArrival(cleanPs5.cards[1]!, cleanPs5.arrivalPhotos);
    expect(looked.palMessage).toContain("I looked at the arrival photo.");
  });

  it("review: the model is told not to talk about loading, an echo of it is stripped, and the claim guard still holds", async () => {
    const echo = fakeClaude((params) => (params.tools?.[0]?.name === "submit_review" ? { ...quiet(), pal_message: "None of the three photos on the card could be loaded, so I only have the seller's word. Price is fair." } : null));
    const { data: verdict, palMessage } = await createBuyerPal({ anthropic: echo, priceLookup, publicMode: true, fetchImage: async () => null, photoBaseUrl: "https://pay-pals.example" }).review(cleanPs5.cards[0]!, cleanPs5.chat.slice(0, 2));
    const reviews = echo.calls.filter((c) => c.tools?.[0]?.name === "submit_review");
    expect(reviews).toHaveLength(2);
    expect(promptText(reviews[0]!)).toContain("Do not mention whether photo files loaded, opened or could be viewed");
    expect(promptText(reviews[0]!)).not.toContain("the file could not be loaded");
    expect(palMessage).not.toMatch(LOADING);
    expect(palMessage).not.toMatch(/could be loaded/);
    expect(verdict.overall).toBe("go");

    const claims = fakeClaude((params) => (params.tools?.[0]?.name === "submit_review" ? { ...quiet(), pal_message: "Not a stock photo listing, I can see the serial." } : null));
    const guarded = await createBuyerPal({ anthropic: claims, priceLookup, publicMode: true, fetchImage: async () => null }).review(cleanPs5.cards[0]!, cleanPs5.chat.slice(0, 2));
    expect(guarded.palMessage).not.toMatch(/stock photo|I can see/);
    expect(guarded.palMessage).not.toMatch(LOADING);
  });

  it("seller pal and the env default: no loading sentence, same card", async () => {
    process.env.PAY_PALS_PUBLIC_MODE = "1";
    const input = { dealId: cleanPs5.deal.id, listingText: cleanPs5.listingText, photos: cleanPs5.listingPhotos, sellerNotes: cleanPs5.sellerNotes, sellerPaypalEmail: cleanPs5.seller.email };
    const pub = await createSellerPal({ anthropic: null }).buildCard(input);
    expect(pub.palMessage).not.toMatch(LOADING);
    expect(pub.data.serial).toBeNull();
    expect(pub.data.boxSerial).toBe(CLEAN_SERIAL);
    const normal = await createSellerPal({ anthropic: null, publicMode: false }).buildCard(input);
    expect(normal.palMessage).toMatch(LOADING);
    expect(normal.data).toMatchObject({ serial: pub.data.serial, boxSerial: pub.data.boxSerial, askingPrice: pub.data.askingPrice });
  });
});
