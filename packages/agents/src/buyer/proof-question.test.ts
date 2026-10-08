import { describe, expect, it } from "vitest";
import { cleanPs5, emptyBox, fakeSlab } from "@pay-pals/contracts";
import { createFixtureCertLookup } from "../cert/fixture-lookup";
import { createFixturePriceLookup } from "../price/fixture-lookup";
import { deviceFamily } from "../seller/listing-parse";
import { fakeClaude } from "../testing/fake-claude";
import { createBuyerPal } from "./buyer-pal";
import { CONSOLE_PROOF_QUESTION, DEVICE_PROOF_QUESTION, hasScreenPhoto, proofQuestion, withProofQuestion } from "./proof-question";

const priceLookup = createFixturePriceLookup();
const certLookup = createFixtureCertLookup();

describe("deviceFamily", () => {
  it("knows consoles, phones, laptops, cameras and wearables, and not a graded card", () => {
    expect(deviceFamily("Sony PlayStation 5 disc edition")).toBe("console");
    expect(deviceFamily("Apple iPhone 14")).toBe("phone");
    expect(deviceFamily("Apple MacBook Air M2")).toBe("laptop");
    expect(deviceFamily("Canon EOS R6 camera")).toBe("camera");
    expect(deviceFamily("Garmin Forerunner 265 smartwatch")).toBe("wearable");
    expect(deviceFamily("Pokemon Base Set Charizard Holo #4")).toBeNull();
  });
});

describe("proofQuestion", () => {
  it("asks for the Console Information screen on clean-ps5 v1 and empty-box, not on v2 which has it", () => {
    expect(proofQuestion(cleanPs5.cards[0]!)).toBe(CONSOLE_PROOF_QUESTION);
    expect(proofQuestion(emptyBox.cards[0]!)).toBe(CONSOLE_PROOF_QUESTION);
    expect(hasScreenPhoto(cleanPs5.cards[1]!)).toBe(true);
    expect(proofQuestion(cleanPs5.cards[1]!)).toBeNull();
  });
  it("skips a graded card, a new item, a non-device, and a null card", () => {
    expect(proofQuestion(fakeSlab.cards[0]!)).toBeNull();
    expect(proofQuestion({ ...cleanPs5.cards[0]!, conditionGrade: "new" })).toBeNull();
    expect(proofQuestion({ ...cleanPs5.cards[0]!, brand: "Herman Miller", model: "Aeron chair", title: "Aeron chair" })).toBeNull();
    expect(proofQuestion(null)).toBeNull();
  });
  it("words it as the system information screen for a phone", () => {
    expect(proofQuestion({ ...cleanPs5.cards[0]!, brand: "Apple", model: "iPhone 14", title: "Apple iPhone 14" })).toBe(DEVICE_PROOF_QUESTION);
  });
  it("puts the proof question first and drops repeats of the same ask", () => {
    expect(withProofQuestion(CONSOLE_PROOF_QUESTION, ["Where will it ship from?", "can you add a photo of the console information screen showing the serial?", "Can you show the Console Information screen on the TV?"])).toEqual([CONSOLE_PROOF_QUESTION, "Where will it ship from?"]);
    expect(withProofQuestion(null, ["Where will it ship from?"])).toEqual(["Where will it ship from?"]);
  });
});

describe("BuyerPal.review asks for proof", () => {
  it("keyless: clean-ps5 v1 and empty-box ask the console question and stay go; v2 asks nothing", async () => {
    const pal = createBuyerPal({ anthropic: null, priceLookup, certLookup });
    const v1 = await pal.review(cleanPs5.cards[0]!, cleanPs5.chat.slice(0, 2));
    expect(v1.data.overall).toBe("go");
    expect(v1.data.questionsForSeller).toEqual([CONSOLE_PROOF_QUESTION]);
    const empty = await pal.review(emptyBox.cards[0]!, emptyBox.chat.slice(0, 2));
    expect(empty.data.overall).toBe("go");
    expect(empty.data.questionsForSeller).toEqual([CONSOLE_PROOF_QUESTION]);
    const v2 = await pal.review(cleanPs5.cards[1]!, cleanPs5.chat);
    expect(v2.data.overall).toBe("go");
    expect(v2.data.questionsForSeller).toEqual([]);
  });
  it("keyless: the graded slab is not asked for a screen", async () => {
    const pal = createBuyerPal({ anthropic: null, priceLookup, certLookup });
    const { data: verdict } = await pal.review({ ...fakeSlab.cards[0]!, askingPrice: 3400 }, fakeSlab.chat.slice(0, 2));
    expect(verdict.questionsForSeller).not.toContain(CONSOLE_PROOF_QUESTION);
    expect(verdict.questionsForSeller).not.toContain(DEVICE_PROOF_QUESTION);
  });
  it("with a model: the proof question stays first, the model's own version of it is dropped, and the cap holds", async () => {
    const model = fakeClaude(() => ({
      additional_flags: [],
      severity_raises: [],
      explanations: [],
      questions_for_seller: ["Where will it ship from?", "Can you show the Console Information screen with the serial?", "Can you add a photo of the HDMI port?", "Do you have the receipt?"],
      pal_message: "Price is fair.",
    }));
    const { data: verdict } = await createBuyerPal({ anthropic: model, priceLookup }).review(cleanPs5.cards[0]!, cleanPs5.chat.slice(0, 2));
    expect(verdict.questionsForSeller[0]).toBe(CONSOLE_PROOF_QUESTION);
    expect(verdict.questionsForSeller).toEqual([CONSOLE_PROOF_QUESTION, "Can you add a photo of the HDMI port?", "Do you have the receipt?"]);
  });
  it("a stop verdict asks nothing", async () => {
    const pal = createBuyerPal({ anthropic: null, priceLookup, certLookup });
    const { data: verdict } = await pal.review({ ...emptyBox.cards[0]!, askingPrice: 150 }, emptyBox.chat.slice(0, 2));
    expect(verdict.overall).toBe("stop");
    expect(verdict.questionsForSeller).toEqual([]);
  });
});
