/**
 * The pal's reasons: the merge rule, the four groups the rules fill on their
 * own, and the two places where the reasons have to agree with something else
 * the pal says.
 */
import { describe, expect, it } from "vitest";
import type { ClaimContext } from "./claim-check";
import { cleanPs5, emptyBox, fakeSlab } from "@pay-pals/contracts";
import { createBuyerPal } from "./buyer-pal";
import { createFixtureCertLookup } from "../cert/fixture-lookup";
import { createFixturePriceLookup } from "../price/fixture-lookup";
import { fakeClaude, promptText } from "../testing/fake-claude";
import { addModelReasons, mergeReasoning, MAX_REASONS_PER_GROUP, tidyReasons } from "./reasoning";
import { CONSOLE_SERIAL_QUESTION } from "./proof-question";

const open: ClaimContext = { imagesRead: true, psaContacted: true, certCheck: null };

const pal = () => createBuyerPal({ anthropic: null, priceLookup: createFixturePriceLookup(), certLookup: createFixtureCertLookup() });

describe("tidyReasons", () => {
  it("drops blanks, repeats and markdown, and keeps the order it was given", () => {
    expect(tidyReasons(["**The price.**", null, "the price", "", false, "The chat."])).toEqual(["The price.", "The chat."]);
  });

  it("caps a group so one long list cannot bury the line that matters", () => {
    const many = Array.from({ length: MAX_REASONS_PER_GROUP + 4 }, (_, i) => `Reason number ${i}.`);
    expect(tidyReasons(many)).toHaveLength(MAX_REASONS_PER_GROUP);
  });
});

describe("the model adds to the reasons and never takes from them", () => {
  const rules = { checked: ["The chat."], found: ["Nothing."], couldNotVerify: ["Not the photos."], wouldChangeMyMind: ["A receipt."] };

  it("keeps every rule line and appends the model's", () => {
    const merged = mergeReasoning(rules, { checked: ["The listing url."], found: [], could_not_verify: [], would_change_my_mind: [] }, open);
    expect(merged.checked).toEqual(["The chat.", "The listing url."]);
    expect(merged.found).toEqual(["Nothing."]);
    expect(merged.couldNotVerify).toEqual(["Not the photos."]);
  });

  it("cannot empty a group by sending nothing for it", () => {
    const merged = mergeReasoning(rules, { checked: [], found: [], could_not_verify: [], would_change_my_mind: [] }, open);
    expect(merged).toEqual(rules);
  });

  it("leaves the rules' reasons alone when the model did not answer at all", () => {
    expect(mergeReasoning(rules, null, open)).toEqual(rules);
  });

  it("drops a model reason that claims a check which did not happen", () => {
    const claims: ClaimContext = { imagesRead: false, psaContacted: false, certCheck: null };
    const merged = mergeReasoning(rules, { checked: ["I looked at the photos and they show a real unit.", "We checked with PSA.", "The seller's reply about the charger."], found: [], could_not_verify: [], would_change_my_mind: [] }, claims);
    expect(merged.checked).toEqual(["The chat.", "The seller's reply about the charger."]);
  });

  it("drops a model reason that overclaims, whatever was examined", () => {
    const merged = mergeReasoning(rules, { checked: [], found: ["The cert is verified."], could_not_verify: [], would_change_my_mind: ["Nothing, the pack guarantees a refund."] }, open);
    expect(merged.found).toEqual(["Nothing."]);
    expect(merged.wouldChangeMyMind).toEqual(["A receipt."]);
  });

  it("drops a model reason lifted out of the prompt we sent", () => {
    expect(addModelReasons([], ["The photo block says the file could not be loaded."], open)).toEqual([]);
  });

  it("does not repeat a rule reason the model sent back in the same words", () => {
    expect(addModelReasons(["The chat."], ["the chat"], open)).toEqual(["The chat."]);
  });
});

describe("the rules fill all four groups with no model at all", () => {
  it.each([fakeSlab, cleanPs5, emptyBox].map((f) => [f.id, f] as const))("%s", async (_id, fixture) => {
    const { data: verdict } = await pal().review(fixture.cards.at(-1)!, fixture.chat, { seller: fixture.seller });
    const reasoning = verdict.reasoning!;
    expect(reasoning).toBeDefined();
    for (const group of ["checked", "found", "couldNotVerify", "wouldChangeMyMind"] as const) {
      expect(Array.isArray(reasoning[group])).toBe(true);
    }
    // The three groups that are never empty for a real card: something was looked at, something came of it,
    // and there is always something a pal running on rules alone could not establish.
    expect(reasoning.checked.length).toBeGreaterThan(0);
    expect(reasoning.found.length).toBeGreaterThan(0);
    expect(reasoning.couldNotVerify.length).toBeGreaterThan(0);
    expect(reasoning.wouldChangeMyMind.length).toBeGreaterThan(0);
  });

  it("says what each check was compared against, not just what was checked", async () => {
    const { data: verdict } = await pal().review(cleanPs5.cards[1]!, cleanPs5.chat, { seller: cleanPs5.seller });
    // Every line in checked names the other side of the comparison.
    for (const line of verdict.reasoning!.checked) expect(line.toLowerCase()).toContain("against");
  });

  it("admits it did not look at the photo files when no model ran, and does not pretend the card has none", async () => {
    const { data: verdict } = await pal().review(cleanPs5.cards[1]!, cleanPs5.chat, { seller: cleanPs5.seller });
    const couldNot = verdict.reasoning!.couldNotVerify.join(" ");
    expect(couldNot).toContain("did not read the 4 photo files");
    expect(couldNot).not.toContain("no photos");
    expect(couldNot).toContain("reference range for this demo");
  });

  it("names the demo cert record rather than letting it pass for the grader", async () => {
    const { data: verdict } = await pal().review(fakeSlab.cards.at(-1)!, fakeSlab.chat, { seller: fakeSlab.seller });
    expect(verdict.reasoning!.couldNotVerify.join(" ")).toContain("demo record standing in for the grader");
  });

  it("gives the scam deal the one thing that would change it, and does not pretend anything else would", async () => {
    const { data: verdict } = await pal().review(fakeSlab.cards.at(-1)!, fakeSlab.chat, { seller: fakeSlab.seller });
    expect(verdict.overall).toBe("stop");
    expect(verdict.reasoning!.wouldChangeMyMind.join(" ")).toContain("Goods and Services checkout");
  });
});

describe("the reasons agree with the questions for the seller", () => {
  it("offers the close-up as what would change its mind exactly when it asks for one", async () => {
    const { data: verdict } = await pal().review(emptyBox.cards[0]!, emptyBox.chat, { seller: emptyBox.seller });
    expect(verdict.questionsForSeller).toContain(CONSOLE_SERIAL_QUESTION);
    expect(verdict.reasoning!.wouldChangeMyMind.join(" ")).toContain("close-up of the serial label on the console itself");
  });

  it("does not offer the close-up once the card carries the serial and no question asks for it", async () => {
    const { data: verdict } = await pal().review(cleanPs5.cards[1]!, cleanPs5.chat, { seller: cleanPs5.seller });
    expect(verdict.questionsForSeller).not.toContain(CONSOLE_SERIAL_QUESTION);
    expect(verdict.reasoning!.wouldChangeMyMind.join(" ")).not.toContain("close-up of the serial label");
  });
});

describe("an unreadable serial becomes a reason rather than a mismatch", () => {
  /** A card whose only photo is the wide shot: the serial is in it and the gate threw the characters away. */
  const card = { ...cleanPs5.cards[0]!, photos: [cleanPs5.cards[0]!.photos[0]!] };
  const reading = {
    brand: "Sony",
    model: "CFI-1015A",
    serial: null,
    serial_legibility: "small_or_soft",
    uncertain_characters: ["position 11: 0 or Q"],
    unreadable_reason: "the sticker is a thin strip in a wide shot of the whole console",
    serial_on: "item",
    item_present: true,
  };

  it("says it could not read the number, and says a close-up would settle it", async () => {
    const client = fakeClaude((params) => (params.tools?.[0]?.name === "report_photo_reading" ? reading : null));
    const buyerPal = createBuyerPal({ anthropic: client, priceLookup: createFixturePriceLookup(), fetchImage: async () => ({ data: "aGk=", mediaType: "image/png" }), photoBaseUrl: "https://example.test" });
    const { data: verdict } = await buyerPal.review(card, cleanPs5.chat.slice(0, 2), { seller: cleanPs5.seller });

    const couldNot = verdict.reasoning!.couldNotVerify.join(" ");
    expect(couldNot).toContain("A serial is in one of the photos but I could not read it");
    expect(couldNot).toContain("the sticker is a thin strip in a wide shot of the whole console");
    expect(couldNot).not.toContain("AJ16495258Q");

    // Item 3: the two halves agree. The gap named in couldNotVerify is the thing wouldChangeMyMind asks for.
    expect(verdict.reasoning!.wouldChangeMyMind.join(" ")).toContain("close-up of the serial label on the console itself");
    expect(verdict.questionsForSeller).toContain(CONSOLE_SERIAL_QUESTION);
  });

  it("tells the review model the reasons already written, so it adds rather than repeats", async () => {
    const client = fakeClaude((params) => (params.tools?.[0]?.name === "report_photo_reading" ? reading : null));
    const buyerPal = createBuyerPal({ anthropic: client, priceLookup: createFixturePriceLookup(), fetchImage: async () => ({ data: "aGk=", mediaType: "image/png" }), photoBaseUrl: "https://example.test" });
    await buyerPal.review(card, cleanPs5.chat.slice(0, 2), { seller: cleanPs5.seller });
    const reviewCall = client.calls.find((c) => c.tools?.[0]?.name === "submit_review")!;
    const sent = promptText(reviewCall);
    expect(sent).toContain("Reasons already worked out, which will appear as given");
    expect(sent).toContain("could not read it");
  });
});

describe("the arrival check explains itself too", () => {
  it("names the missing item, what it could not read from it, and what would change it", async () => {
    const { data: check } = await pal().checkArrival(emptyBox.cards.at(-1)!, emptyBox.arrivalPhotos);
    expect(check.matches).toBe(false);
    const reasoning = check.reasoning!;
    expect(reasoning.found.join(" ")).toContain("nothing else");
    expect(reasoning.couldNotVerify.join(" ")).toContain("nothing to read a serial from");
    expect(reasoning.wouldChangeMyMind.join(" ")).toContain("photo of the item itself");
  });

  it("fills all four groups even when there are no arrival photos at all", async () => {
    const { data: check } = await pal().checkArrival(cleanPs5.cards.at(-1)!, []);
    const reasoning = check.reasoning!;
    expect(reasoning.checked.length).toBeGreaterThan(0);
    expect(reasoning.couldNotVerify.join(" ")).toContain("no arrival photos");
    expect(reasoning.wouldChangeMyMind.length).toBeGreaterThan(0);
    expect(Array.isArray(reasoning.found)).toBe(true);
  });
});
