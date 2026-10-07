import { describe, expect, it } from "vitest";
import { ArrivalCheckSchema, CLEAN_SERIAL, EMPTY_BOX_LOCKED_SERIAL, FAKE_SLAB_CERT, VerdictSchema, cleanPs5, emptyBox, fakeSlab, hasStop } from "@pay-pals/contracts";
import { createFixtureCertLookup } from "../cert/fixture-lookup";
import { createFixturePriceLookup } from "../price/fixture-lookup";
import { fakeClaude, promptText } from "../testing/fake-claude";
import { says } from "../testing/builders";
import { createBuyerPal } from "./buyer-pal";

const priceLookup = createFixturePriceLookup();
const certLookup = createFixtureCertLookup();
const quietModel = () => ({ additional_flags: [], severity_raises: [], explanations: [], questions_for_seller: [], pal_message: "Looks fine to me." });

describe("BuyerPal.review on fake-slab", () => {
  const card = fakeSlab.cards.at(-1)!;

  it("stops with the required flags, including CERT_MISMATCH, even when the model returns no flags", async () => {
    const pal = createBuyerPal({ anthropic: fakeClaude(quietModel), priceLookup, certLookup });
    const { data: verdict, palMessage } = await pal.review(card, fakeSlab.chat, { seller: fakeSlab.seller });
    expect(VerdictSchema.safeParse(verdict).success).toBe(true);
    const codes = verdict.flags.map((f) => f.code);
    for (const code of fakeSlab.expectedVerdict.requiredFlags) expect(codes).toContain(code);
    expect(codes).toContain("STOCK_OR_REUSED_PHOTO");
    expect(codes).not.toContain("MISSING_SERIAL");
    expect(verdict.overall).toBe("stop");
    expect(verdict.priceCheck?.marketLow).toBe(3000);
    expect(verdict.certCheck?.matches).toBe(false);
    expect(verdict.certCheck?.record.certNumber).toBe(FAKE_SLAB_CERT);
    expect(verdict.certCheck?.explanation).toContain("2016 Pokemon XY Evolutions Charizard Holo #11");
    expect(palMessage).toBe(verdict.palMessage);
    expect(palMessage).not.toMatch(/[—!]/);
  });

  it("stops even when the model tries to drop and downgrade the rule flags", async () => {
    const model = fakeClaude(() => ({
      additional_flags: [],
      severity_raises: [
        { code: "FRIENDS_AND_FAMILY_REQUEST", severity: "info" },
        { code: "PRICE_FAR_BELOW_MARKET", severity: "info" },
        { code: "URGENCY_PRESSURE", severity: "info" },
        { code: "CERT_MISMATCH", severity: "info" },
      ],
      explanations: [],
      questions_for_seller: ["Can you ship today?"],
      pal_message: "Great deal, pay now!",
    }));
    const pal = createBuyerPal({ anthropic: model, priceLookup, certLookup });
    const { data: verdict } = await pal.review(card, fakeSlab.chat);
    expect(verdict.overall).toBe("stop");
    expect(verdict.flags.find((f) => f.code === "FRIENDS_AND_FAMILY_REQUEST")!.severity).toBe("stop");
    expect(verdict.flags.find((f) => f.code === "PRICE_FAR_BELOW_MARKET")!.severity).toBe("stop");
    expect(verdict.flags.find((f) => f.code === "CERT_MISMATCH")!.severity).toBe("stop");
    expect(verdict.flags.find((f) => f.code === "URGENCY_PRESSURE")!.severity).toBe("caution");
    expect(verdict.palMessage).toBe("Great deal, pay now.");
  });

  it("stops with no model at all and shows the model the rule flags and the cert check as fixed facts", async () => {
    const offline = createBuyerPal({ anthropic: null, priceLookup, certLookup });
    const { data: verdict } = await offline.review(card, fakeSlab.chat);
    expect(verdict.overall).toBe("stop");
    expect(verdict.questionsForSeller).toEqual([]);
    expect(verdict.palMessage).toContain("a grading cert that does not match the card");

    const model = fakeClaude(quietModel);
    await createBuyerPal({ anthropic: model, priceLookup, certLookup }).review(card, fakeSlab.chat);
    expect(model.calls).toHaveLength(1);
    const shown = promptText(model.calls[0]!);
    expect(shown).toContain("Fixed facts");
    expect(shown).toContain("CERT_MISMATCH");
    expect(shown).toContain("Cert check (fixed fact)");
    expect(model.calls[0]!.tools?.[0]?.name).toBe("submit_review");
  });

  it("without a cert lookup the cert is not checked and no CERT_MISMATCH is raised", async () => {
    const { data: verdict } = await createBuyerPal({ anthropic: null, priceLookup }).review(card, fakeSlab.chat);
    expect(verdict.certCheck).toBeUndefined();
    expect(verdict.flags.map((f) => f.code)).not.toContain("CERT_MISMATCH");
    expect(verdict.overall).toBe("stop");
  });

  it("a matching PSA record adds no flag and the pal message says PSA confirms the cert", async () => {
    const matching = {
      async lookup(certNumber: string) {
        return { provider: "psa" as const, certNumber, subject: "1999 POKEMON GAME CHARIZARD-HOLO #4", grade: "GEM MT 10", year: "1999", brand: "POKEMON GAME", raw: null, checkedAt: new Date().toISOString() };
      },
    };
    const honest = { ...card, askingPrice: 3400, photos: [{ ...card.photos[0]!, whatItShows: "Front of the slab in the seller's hand, label and cert legible." }] };
    const chat = [says("buyer", "Hi, I sent the invite."), says("seller", "Joined. Photos are up.")];
    const { data: verdict, palMessage } = await createBuyerPal({ anthropic: null, priceLookup, certLookup: matching }).review(honest, chat);
    expect(verdict.overall).toBe("go");
    expect(verdict.flags).toEqual([]);
    expect(verdict.certCheck?.matches).toBe(true);
    expect(palMessage).toContain(`PSA confirms cert ${FAKE_SLAB_CERT}: 1999 POKEMON GAME CHARIZARD-HOLO #4, grade GEM MT 10.`);

    const model = fakeClaude(quietModel);
    await createBuyerPal({ anthropic: model, priceLookup, certLookup: matching }).review(honest, chat);
    expect(promptText(model.calls[0]!)).toContain("Include that sentence in your message");
  });
});

describe("BuyerPal.review with no card", () => {
  it("a refusal in the chat gives stop with INVITE_REFUSED, cardVersion 0 and no price check", async () => {
    const chat = [says("buyer", "I sent you a Pay Pals invite for the slab."), says("seller", "Not doing that app. Friends & Family only or I sell it to the next guy.")];
    const { data: verdict, palMessage } = await createBuyerPal({ anthropic: null, priceLookup, certLookup }).review(null, chat);
    expect(VerdictSchema.safeParse(verdict).success).toBe(true);
    expect(verdict.cardVersion).toBe(0);
    expect(verdict.priceCheck).toBeNull();
    expect(verdict.certCheck).toBeUndefined();
    expect(verdict.dealId).toBe(cleanPs5.deal.id);
    expect(verdict.overall).toBe("stop");
    const codes = verdict.flags.map((f) => f.code);
    expect(codes).toContain("INVITE_REFUSED");
    expect(codes).toContain("FRIENDS_AND_FAMILY_REQUEST");
    expect(codes).not.toContain("MISSING_SERIAL");
    expect(verdict.flags.find((f) => f.code === "INVITE_REFUSED")!.evidence).toContain("Friends & Family only or I sell it to the next guy");
    expect(palMessage).toContain("no item card yet");
    expect(palMessage).toContain("the seller refusing Pay Pals protection");
  });

  it("inviteDeclined in the context is enough on its own", async () => {
    const { data: verdict } = await createBuyerPal({ anthropic: null, priceLookup }).review(null, [], { inviteDeclined: true });
    expect(verdict.overall).toBe("stop");
    expect(verdict.flags.map((f) => f.code)).toEqual(["INVITE_REFUSED"]);
    expect(verdict.dealId).toBe("unknown");
  });

  it("a friendly chat with no card is go and says what it could not check, with the model told there is no card", async () => {
    const chat = [says("buyer", "Sent you the invite."), says("seller", "I joined, uploading photos now.")];
    const model = fakeClaude(quietModel);
    const { data: verdict } = await createBuyerPal({ anthropic: model, priceLookup }).review(null, chat);
    expect(verdict.overall).toBe("go");
    expect(promptText(model.calls[0]!)).toContain("There is no item card yet");
    const offline = await createBuyerPal({ anthropic: null, priceLookup }).review(null, chat);
    expect(offline.palMessage).toContain("could not check the price, the serial, the photos or a grading cert");
  });
});

describe("BuyerPal.review on clean-ps5", () => {
  it("says go or caution with no stop flag, with and without a model", async () => {
    const card = cleanPs5.cards.at(-1)!;
    for (const anthropic of [null, fakeClaude(quietModel)]) {
      const pal = createBuyerPal({ anthropic, priceLookup, certLookup });
      const { data: verdict } = await pal.review(card, cleanPs5.chat, { seller: cleanPs5.seller });
      expect(["go", "caution"]).toContain(verdict.overall);
      expect(hasStop(verdict.flags)).toBe(false);
      expect(verdict.certCheck).toBeUndefined();
      expect(VerdictSchema.safeParse(verdict).success).toBe(true);
    }
  });

  it("drops a model flag built from its own unanswered questions, so the clean deal stays go", async () => {
    const model = fakeClaude(() => ({
      additional_flags: [
        {
          code: "OTHER",
          severity: "caution",
          evidence: "the seller only answered the screen question and skipped the ownership, lost-or-stolen and firmware questions your pal asked",
          explanation: "The seller did not answer everything.",
        },
      ],
      severity_raises: [],
      explanations: [],
      questions_for_seller: ["Where did you buy it?"],
      pal_message: "Mostly fine.",
    }));
    const { data: verdict } = await createBuyerPal({ anthropic: model, priceLookup }).review(cleanPs5.cards.at(-1)!, cleanPs5.chat);
    expect(verdict.overall).toBe("go");
    expect(verdict.flags).toEqual([]);
    expect(verdict.questionsForSeller).toEqual(["Where did you buy it?"]);
  });

  it("keeps a model flag that quotes a real seller line, at the severity it chose", async () => {
    const model = fakeClaude(() => ({
      additional_flags: [{ code: "OTHER", severity: "caution", evidence: 'Seller wrote: "Everything is on the card my pal built. Ask away."', explanation: "The seller points at the card instead of answering." }],
      severity_raises: [],
      explanations: [],
      questions_for_seller: ["Where will it ship from?", "How long have you owned it?", "Can you add a photo of the HDMI port?", "Any warranty left?", "Do you have the receipt?"],
      pal_message: "Price is fair. One question first.",
    }));
    const { data: verdict } = await createBuyerPal({ anthropic: model, priceLookup }).review(cleanPs5.cards.at(-1)!, cleanPs5.chat);
    expect(verdict.overall).toBe("caution");
    expect(verdict.flags).toHaveLength(1);
    expect(verdict.flags[0]!.raisedByRule).toBe(false);
    expect(verdict.questionsForSeller).toEqual(["Can you add a photo of the HDMI port?", "Do you have the receipt?", "Where will it ship from?"]);
  });

  it("raises a grounded caution when the item serial and the box label serial differ", async () => {
    const card = { ...cleanPs5.cards[0]!, boxSerial: "AH900000001" };
    const { data: verdict } = await createBuyerPal({ anthropic: null, priceLookup }).review(card, cleanPs5.chat.slice(0, 2));
    expect(verdict.overall).toBe("caution");
    expect(verdict.flags).toHaveLength(1);
    expect(verdict.flags[0]).toMatchObject({ code: "OTHER", severity: "caution", raisedByRule: true });
    expect(verdict.flags[0]!.evidence).toContain(CLEAN_SERIAL);
    expect(verdict.flags[0]!.evidence).toContain("AH900000001");
  });

  it("tells the model what is fair to ask for with used electronics", async () => {
    const model = fakeClaude(quietModel);
    await createBuyerPal({ anthropic: model, priceLookup }).review(cleanPs5.cards[0]!, cleanPs5.chat.slice(0, 2));
    const shown = promptText(model.calls[0]!);
    expect(shown).toContain("proof that it powers on and a system or settings screen that shows the serial are fair things to ask for when the card does not show them");
    expect(shown).toContain("A missing answer, an unasked question or something you merely wish you knew is never a flag.");
  });

  it("clean-ps5 v1 with rules only is go with no questions", async () => {
    const { data: verdict } = await createBuyerPal({ anthropic: null, priceLookup }).review(cleanPs5.cards[0]!, cleanPs5.chat.slice(0, 2));
    expect(verdict.overall).toBe("go");
    expect(verdict.questionsForSeller).toEqual([]);
  });
});

describe("BuyerPal.checkArrival", () => {
  it("empty-box: matches false, serial not present, the box label does not count, from photo descriptions", async () => {
    const pal = createBuyerPal({ anthropic: null, priceLookup });
    const { data: check, palMessage } = await pal.checkArrival(emptyBox.cards[0]!, emptyBox.arrivalPhotos);
    expect(ArrivalCheckSchema.safeParse(check).success).toBe(true);
    expect(check.matches).toBe(false);
    const serial = check.mismatches.find((m) => m.field === "serial")!;
    expect(serial.expected).toBe(EMPTY_BOX_LOCKED_SERIAL);
    expect(serial.observed).toBe("not present, box arrived empty");
    expect(serial.explanation).toContain("box label");
    for (const field of emptyBox.expectedArrival!.mismatchFields) expect(check.mismatches.map((m) => m.field)).toContain(field);
    const other = check.mismatches.find((m) => m.field === "other")!;
    expect(other.observed).toContain("Only the foam insert inside");
    expect(check.observed.serial).toBeNull();
    expect(palMessage).toContain("without the item");
    expect(palMessage).toContain(`box label shows ${EMPTY_BOX_LOCKED_SERIAL}, which does not count`);
    expect(palMessage).toContain("dispute");
    expect(palMessage).toContain("photo descriptions");
  });

  it("clean-ps5: matches true with the serial confirmed on the item", async () => {
    const pal = createBuyerPal({ anthropic: null, priceLookup });
    const { data: check, palMessage } = await pal.checkArrival(cleanPs5.cards.at(-1)!, cleanPs5.arrivalPhotos);
    expect(check.matches).toBe(true);
    expect(check.mismatches).toEqual([]);
    expect(check.observed.serial).toBe(CLEAN_SERIAL);
    expect(palMessage).toContain("confirmed on the item itself");
  });

  it("a box label alone never satisfies the item serial, even when it matches the card", async () => {
    const pal = createBuyerPal({ anthropic: null, priceLookup });
    const labelOnly = [emptyBox.arrivalPhotos[1]!];
    const { data: check, palMessage } = await pal.checkArrival(emptyBox.cards[0]!, labelOnly);
    expect(check.matches).toBe(false);
    expect(check.mismatches.map((m) => m.field)).toEqual(["serial"]);
    expect(check.mismatches[0]!.observed).toBe("not readable in the arrival photos");
    expect(palMessage).toContain("A box label does not count");
  });

  it("a different serial on the item is named as a different unit", async () => {
    const pal = createBuyerPal({ anthropic: null, priceLookup });
    const photos = [{ ...cleanPs5.arrivalPhotos[0]!, whatItShows: "Back of the console as received. Serial AJ204567113." }];
    const { data: check } = await pal.checkArrival(cleanPs5.cards.at(-1)!, photos);
    expect(check.matches).toBe(false);
    expect(check.mismatches[0]).toMatchObject({ field: "serial", expected: CLEAN_SERIAL, observed: "AJ204567113" });
  });

  it("uses Claude vision when the photo can be fetched and respects where the serial is printed", async () => {
    const model = fakeClaude((params) => {
      const shown = promptText(params);
      if (shown.includes("box label")) return { brand: "Sony", model: "PlayStation 5", serial: EMPTY_BOX_LOCKED_SERIAL, serial_on: "packaging", item_present: null };
      return { brand: null, model: null, serial: null, serial_on: null, item_present: false };
    });
    const fetchImage = async () => ({ data: "AAAA", mediaType: "image/jpeg" as const });
    const pal = createBuyerPal({ anthropic: model, priceLookup, fetchImage });
    const photos = [
      { ...emptyBox.arrivalPhotos[0]!, url: "https://example.com/open.jpg", whatItShows: "The box, opened." },
      { ...emptyBox.arrivalPhotos[1]!, url: "https://example.com/label.jpg", whatItShows: "The box label." },
    ];
    const { data: check, palMessage } = await pal.checkArrival(emptyBox.cards[0]!, photos);
    expect(model.calls).toHaveLength(2);
    expect(model.calls[0]!.messages[0]!.content[0]).toMatchObject({ type: "image" });
    expect(check.matches).toBe(false);
    expect(check.observed.serial).toBeNull();
    expect(check.mismatches.map((m) => m.field)).toEqual(["serial", "other"]);
    expect(check.mismatches[0]!.observed).toBe("not present, box arrived empty");
    expect(palMessage).not.toContain("photo descriptions");
  });
});
