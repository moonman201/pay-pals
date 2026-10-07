import { describe, expect, it } from "vitest";
import {
  ArrivalCheckSchema,
  VerdictSchema,
  WRONG_ITEM_ARRIVED_SERIAL,
  WRONG_ITEM_LOCKED_SERIAL,
  cleanGarmin,
  hasStop,
  scamGarmin,
  wrongItem,
} from "@pay-pals/contracts";
import { createFixturePriceLookup } from "../price/fixture-lookup";
import { fakeClaude, promptText } from "../testing/fake-claude";
import { createBuyerPal } from "./buyer-pal";

const priceLookup = createFixturePriceLookup();
const quietModel = () => ({ additional_flags: [], severity_raises: [], explanations: [], questions_for_seller: [], pal_message: "Looks fine to me." });

describe("BuyerPal.review on scam-garmin", () => {
  const card = scamGarmin.cards.at(-1)!;

  it("stops with the required flags even when the model returns no flags", async () => {
    const pal = createBuyerPal({ anthropic: fakeClaude(quietModel), priceLookup });
    const { data: verdict, palMessage } = await pal.review(card, scamGarmin.chat, { seller: scamGarmin.seller });
    expect(VerdictSchema.safeParse(verdict).success).toBe(true);
    const codes = verdict.flags.map((f) => f.code);
    for (const code of scamGarmin.expectedVerdict.requiredFlags) expect(codes).toContain(code);
    expect(verdict.overall).toBe("stop");
    expect(verdict.priceCheck?.marketLow).toBe(420);
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
      ],
      explanations: [],
      questions_for_seller: ["Can you ship today?"],
      pal_message: "Great deal, pay now!",
    }));
    const pal = createBuyerPal({ anthropic: model, priceLookup });
    const { data: verdict } = await pal.review(card, scamGarmin.chat);
    expect(verdict.overall).toBe("stop");
    expect(verdict.flags.find((f) => f.code === "FRIENDS_AND_FAMILY_REQUEST")!.severity).toBe("stop");
    expect(verdict.flags.find((f) => f.code === "PRICE_FAR_BELOW_MARKET")!.severity).toBe("stop");
    expect(verdict.flags.find((f) => f.code === "URGENCY_PRESSURE")!.severity).toBe("caution");
    expect(verdict.palMessage).toBe("Great deal, pay now.");
  });

  it("stops with no model at all and shows the model the rule flags as fixed facts", async () => {
    const offline = createBuyerPal({ anthropic: null, priceLookup });
    const { data: verdict } = await offline.review(card, scamGarmin.chat);
    expect(verdict.overall).toBe("stop");
    expect(verdict.questionsForSeller).toEqual([]);

    const model = fakeClaude(quietModel);
    await createBuyerPal({ anthropic: model, priceLookup }).review(card, scamGarmin.chat);
    expect(model.calls).toHaveLength(1);
    const shown = promptText(model.calls[0]!);
    expect(shown).toContain("Fixed facts");
    expect(shown).toContain("FRIENDS_AND_FAMILY_REQUEST");
    expect(model.calls[0]!.tools?.[0]?.name).toBe("submit_review");
  });
});

describe("BuyerPal.review on clean-garmin", () => {
  it("says go or caution with no stop flag, with and without a model", async () => {
    const card = cleanGarmin.cards.at(-1)!;
    for (const anthropic of [null, fakeClaude(quietModel)]) {
      const pal = createBuyerPal({ anthropic, priceLookup });
      const { data: verdict } = await pal.review(card, cleanGarmin.chat, { seller: cleanGarmin.seller });
      expect(["go", "caution"]).toContain(verdict.overall);
      expect(hasStop(verdict.flags)).toBe(false);
      expect(VerdictSchema.safeParse(verdict).success).toBe(true);
    }
  });

  it("drops a model flag built from its own unanswered questions, so the clean deal stays go", async () => {
    const model = fakeClaude(() => ({
      additional_flags: [
        {
          code: "OTHER",
          severity: "caution",
          evidence: "the seller only answered the battery question and skipped the ownership, lost-or-stolen and firmware questions your pal asked",
          explanation: "The seller did not answer everything.",
        },
      ],
      severity_raises: [],
      explanations: [],
      questions_for_seller: ["Where did you buy it?"],
      pal_message: "Mostly fine.",
    }));
    const { data: verdict } = await createBuyerPal({ anthropic: model, priceLookup }).review(cleanGarmin.cards.at(-1)!, cleanGarmin.chat);
    expect(verdict.overall).toBe("go");
    expect(verdict.flags).toEqual([]);
    expect(verdict.questionsForSeller).toEqual(["Where did you buy it?"]);
  });

  it("keeps a model flag that quotes a real seller line, at the severity it chose", async () => {
    const model = fakeClaude(() => ({
      additional_flags: [{ code: "OTHER", severity: "caution", evidence: 'Seller wrote: "Everything is on the card my pal built. Ask away."', explanation: "The seller points at the card instead of answering." }],
      severity_raises: [],
      explanations: [],
      questions_for_seller: ["Where will it ship from?", "How long have you owned it?", "Can you add a photo of the charging port?", "Any warranty left?", "Do you have the receipt?"],
      pal_message: "Price is fair. One question first.",
    }));
    const { data: verdict } = await createBuyerPal({ anthropic: model, priceLookup }).review(cleanGarmin.cards.at(-1)!, cleanGarmin.chat);
    expect(verdict.overall).toBe("caution");
    expect(verdict.flags).toHaveLength(1);
    expect(verdict.flags[0]!.raisedByRule).toBe(false);
    expect(verdict.questionsForSeller).toEqual(["Can you add a photo of the charging port?", "Do you have the receipt?", "Where will it ship from?"]);
  });

  it("clean-garmin v1 with rules only is go with no questions", async () => {
    const { data: verdict } = await createBuyerPal({ anthropic: null, priceLookup }).review(cleanGarmin.cards[0]!, cleanGarmin.chat.slice(0, 2));
    expect(verdict.overall).toBe("go");
    expect(verdict.questionsForSeller).toEqual([]);
  });
});

describe("BuyerPal.checkArrival", () => {
  it("wrong-item: matches false with the serial mismatch named, from photo descriptions", async () => {
    const pal = createBuyerPal({ anthropic: null, priceLookup });
    const { data: check, palMessage } = await pal.checkArrival(wrongItem.cards[0]!, wrongItem.arrivalPhotos);
    expect(ArrivalCheckSchema.safeParse(check).success).toBe(true);
    expect(check.matches).toBe(false);
    const serial = check.mismatches.find((m) => m.field === "serial");
    expect(serial).toMatchObject({ expected: WRONG_ITEM_LOCKED_SERIAL, observed: WRONG_ITEM_ARRIVED_SERIAL });
    for (const field of wrongItem.expectedArrival!.mismatchFields) {
      expect(check.mismatches.map((m) => m.field)).toContain(field);
    }
    expect(check.observed.serial).toBe(WRONG_ITEM_ARRIVED_SERIAL);
    expect(palMessage).toContain("photo descriptions");
  });

  it("clean-garmin: matches true with the serial confirmed", async () => {
    const pal = createBuyerPal({ anthropic: null, priceLookup });
    const { data: check } = await pal.checkArrival(cleanGarmin.cards.at(-1)!, cleanGarmin.arrivalPhotos);
    expect(check.matches).toBe(true);
    expect(check.mismatches).toEqual([]);
    expect(check.observed.serial).toBe(cleanGarmin.cards[0]!.serial);
  });

  it("uses Claude vision when the photo can be fetched", async () => {
    const model = fakeClaude(() => ({ brand: "Garmin", model: "Fenix 6", serial: "6xr 118204" }));
    const fetchImage = async () => ({ data: "AAAA", mediaType: "image/jpeg" as const });
    const pal = createBuyerPal({ anthropic: model, priceLookup, fetchImage });
    const photos = [{ ...wrongItem.arrivalPhotos[0]!, url: "https://example.com/arrival.jpg", whatItShows: "Back of the watch." }];
    const { data: check, palMessage } = await pal.checkArrival(wrongItem.cards[0]!, photos);
    expect(model.calls).toHaveLength(1);
    expect(model.calls[0]!.messages[0]!.content[0]).toMatchObject({ type: "image" });
    expect(check.matches).toBe(false);
    expect(check.observed.serial).toBe(WRONG_ITEM_ARRIVED_SERIAL);
    expect(check.mismatches.map((m) => m.field)).toEqual(["serial", "model"]);
    expect(palMessage).not.toContain("photo descriptions");
  });
});
