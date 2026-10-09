import { describe, expect, it } from "vitest";
import { cleanPs5, emptyBox, fakeSlab } from "@pay-pals/contracts";
import { createFixtureCertLookup } from "../cert/fixture-lookup";
import { createFixturePriceLookup } from "../price/fixture-lookup";
import { deviceFamily } from "../seller/listing-parse";
import { fakeClaude } from "../testing/fake-claude";
import { createBuyerPal } from "./buyer-pal";
import {
  CONSOLE_SERIAL_QUESTION,
  DATED_NOTE_QUESTION,
  DEVICE_SERIAL_QUESTION,
  datedNoteQuestion,
  hasDatedNotePhoto,
  hasSerialCloseUp,
  serialCloseUpQuestion,
  withProofQuestions,
} from "./proof-question";

const priceLookup = createFixturePriceLookup();
const certLookup = createFixtureCertLookup();

describe("deviceFamily", () => {
  it("knows consoles, phones, laptops, cameras and wearables, and not a graded card", () => {
    expect(deviceFamily("Sony PlayStation 5 disc edition, CFI-1015A")).toBe("console");
    expect(deviceFamily("Apple iPhone 14")).toBe("phone");
    expect(deviceFamily("Apple MacBook Air M2")).toBe("laptop");
    expect(deviceFamily("Canon EOS R6 camera")).toBe("camera");
    expect(deviceFamily("Sun & Moon Tag Bolt, Gengar & Mimikyu GX, 038/095")).toBeNull();
  });
});

describe("serialCloseUpQuestion", () => {
  it("asks on clean-ps5 v1 and empty-box, where only the box label carries the number", () => {
    expect(cleanPs5.cards[0]!.serial).toBeNull();
    expect(cleanPs5.cards[0]!.boxSerial).not.toBeNull();
    expect(serialCloseUpQuestion(cleanPs5.cards[0]!)).toBe(CONSOLE_SERIAL_QUESTION);
    expect(serialCloseUpQuestion(emptyBox.cards[0]!)).toBe(CONSOLE_SERIAL_QUESTION);
  });
  it("stops asking once the close-up is on the card", () => {
    expect(hasSerialCloseUp(cleanPs5.cards[1]!)).toBe(true);
    expect(hasSerialCloseUp(cleanPs5.cards[0]!)).toBe(false);
    expect(serialCloseUpQuestion(cleanPs5.cards[1]!)).toBeNull();
    // A close-up caption alone is enough, even before the serial field is filled in.
    const closeUpOnly = { ...cleanPs5.cards[0]!, photos: cleanPs5.cards[1]!.photos };
    expect(serialCloseUpQuestion(closeUpOnly)).toBeNull();
  });
  it("does not count the box label as the item's own close-up", () => {
    const boxOnly = { ...cleanPs5.cards[0]!, photos: [cleanPs5.cards[0]!.photos[1]!] };
    expect(hasSerialCloseUp(boxOnly)).toBe(false);
    expect(serialCloseUpQuestion(boxOnly)).toBe(CONSOLE_SERIAL_QUESTION);
  });
  it("skips a graded card, a new item, a non-device and a null card, and words it for other devices", () => {
    expect(serialCloseUpQuestion(fakeSlab.cards[0]!)).toBeNull();
    expect(serialCloseUpQuestion({ ...cleanPs5.cards[0]!, conditionGrade: "new" })).toBeNull();
    expect(serialCloseUpQuestion({ ...cleanPs5.cards[0]!, brand: "Herman Miller", model: "Aeron chair", title: "Aeron chair" })).toBeNull();
    expect(serialCloseUpQuestion(null)).toBeNull();
    expect(serialCloseUpQuestion({ ...cleanPs5.cards[0]!, brand: "Apple", model: "iPhone 14", title: "Apple iPhone 14" })).toBe(DEVICE_SERIAL_QUESTION);
  });
});

describe("datedNoteQuestion", () => {
  it("asks for the slab beside a dated handwritten note whenever there is a cert", () => {
    expect(datedNoteQuestion(fakeSlab.cards[0]!)).toBe(DATED_NOTE_QUESTION);
    expect(DATED_NOTE_QUESTION).toBe("Can you send one photo of the slab next to a handwritten note with your name and today's date on it?");
  });
  it("stops once a photo caption shows such a note, and never asks without a cert", () => {
    const withNote = {
      ...fakeSlab.cards[0]!,
      photos: [...fakeSlab.cards[0]!.photos, { url: "/x.jpg", whatItShows: "The slab held beside a handwritten note reading Chris W. and today's date.", addedBy: "seller" as const }],
    };
    expect(hasDatedNotePhoto(withNote)).toBe(true);
    expect(datedNoteQuestion(withNote)).toBeNull();
    expect(datedNoteQuestion(cleanPs5.cards[0]!)).toBeNull();
    expect(datedNoteQuestion(null)).toBeNull();
  });
});

describe("withProofQuestions", () => {
  it("puts ours first and drops the model's version of the same ask", () => {
    expect(
      withProofQuestions([CONSOLE_SERIAL_QUESTION], ["Where will it ship from?", "Can you send a close-up of the serial sticker?", "can you send a close-up of the serial label on the console itself?"]),
    ).toEqual([CONSOLE_SERIAL_QUESTION, "Where will it ship from?"]);
    expect(withProofQuestions([DATED_NOTE_QUESTION], ["Can you hold the slab next to a handwritten note?", "Where did you buy it?"])).toEqual([DATED_NOTE_QUESTION, "Where did you buy it?"]);
    expect(withProofQuestions([null], ["Where will it ship from?"])).toEqual(["Where will it ship from?"]);
  });
});

describe("BuyerPal.review asks for proof", () => {
  it("keyless: clean-ps5 v1 and empty-box are go and ask for the console close-up; v2 asks nothing", async () => {
    const pal = createBuyerPal({ anthropic: null, priceLookup, certLookup });
    const v1 = await pal.review(cleanPs5.cards[0]!, cleanPs5.chat.slice(0, 2));
    expect(v1.data.overall).toBe("go");
    expect(v1.data.questionsForSeller).toEqual([CONSOLE_SERIAL_QUESTION]);
    const empty = await pal.review(emptyBox.cards[0]!, emptyBox.chat.slice(0, 2));
    expect(empty.data.overall).toBe("go");
    expect(empty.data.questionsForSeller).toEqual([CONSOLE_SERIAL_QUESTION]);
    const v2 = await pal.review(cleanPs5.cards[1]!, cleanPs5.chat);
    expect(v2.data.overall).toBe("go");
    expect(v2.data.questionsForSeller).toEqual([]);
  });

  it("keyless: the slab is asked for the dated note, even though the verdict is a stop", async () => {
    const pal = createBuyerPal({ anthropic: null, priceLookup, certLookup });
    const { data: verdict } = await pal.review(fakeSlab.cards[0]!, fakeSlab.chat);
    expect(verdict.overall).toBe("stop");
    expect(verdict.questionsForSeller).toEqual([DATED_NOTE_QUESTION]);
    expect(verdict.questionsForSeller).not.toContain(CONSOLE_SERIAL_QUESTION);
  });

  it("with a model: our questions stay first, its version of them is dropped, and the cap holds", async () => {
    const model = fakeClaude(() => ({
      additional_flags: [],
      severity_raises: [],
      explanations: [],
      questions_for_seller: ["Where will it ship from?", "Can you send a close-up of the serial label?", "Can you add a photo of the HDMI port?", "Do you have the receipt?"],
      pal_message: "Price is fair.",
    }));
    const { data: verdict } = await createBuyerPal({ anthropic: model, priceLookup }).review(cleanPs5.cards[0]!, cleanPs5.chat.slice(0, 2));
    expect(verdict.questionsForSeller).toEqual([CONSOLE_SERIAL_QUESTION, "Can you add a photo of the HDMI port?", "Do you have the receipt?"]);
  });
});
