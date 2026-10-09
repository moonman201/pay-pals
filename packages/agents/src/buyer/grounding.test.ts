import { describe, expect, it } from "vitest";
import { CLEAN_SERIAL, FAKE_SLAB_CERT, cleanPs5, fakeSlab } from "@pay-pals/contracts";
import { buildGroundingCorpus, isGrounded, quotesPromptScaffolding } from "./grounding";

const clean = buildGroundingCorpus(cleanPs5.cards[1]!, cleanPs5.chat);
const slab = buildGroundingCorpus(fakeSlab.cards[0]!, fakeSlab.chat);
const chatOnly = buildGroundingCorpus(null, fakeSlab.chat);

describe("isGrounded", () => {
  it("accepts a quote from the chat, even with different quoting and case", () => {
    expect(isGrounded('Seller wrote: "Everything is on the card my pal built."', clean)).toBe(true);
    expect(isGrounded("seller said “IN THE NEXT HOUR OR IT GOES TO THE NEXT PERSON”", slab)).toBe(true);
    expect(isGrounded("seller said “first to send Friends & Family gets it”", chatOnly)).toBe(true);
  });
  it("accepts a card field quoted in plain words", () => {
    expect(isGrounded("The PayPal account quickcash.deals.2026@example.com is not the seller", slab)).toBe(true);
    expect(isGrounded("Asking price $750", slab)).toBe(true);
    expect(isGrounded('The only caption is "Front of a PSA slab on a wooden table"', slab)).toBe(true);
    expect(isGrounded(`certNumber ${FAKE_SLAB_CERT}`, slab)).toBe(true);
    expect(isGrounded(`serial ${CLEAN_SERIAL}`, clean)).toBe(true);
    expect(isGrounded(`boxSerial ${CLEAN_SERIAL}`, clean)).toBe(true);
  });
  it("rejects the model's own unanswered questions and other invented evidence", () => {
    expect(isGrounded("the seller only answered the screen question and skipped the ownership, lost-or-stolen and firmware questions your pal asked", clean)).toBe(false);
    expect(isGrounded("Seller has not said where it ships from.", clean)).toBe(false);
    expect(isGrounded("chat", clean)).toBe(false);
    expect(isGrounded("", clean)).toBe(false);
    expect(isGrounded("Asking price $750", chatOnly)).toBe(false);
  });
  it("rejects evidence copied out of the prompt instead of the deal", () => {
    expect(isGrounded(`Photo block: all four photos, including "console-back-serial.jpg", are marked "Not looked at (the file could not be loaded)"`, clean)).toBe(false);
    expect(isGrounded("The photos could not be loaded", clean)).toBe(false);
    expect(isGrounded("Photos on the card and what was actually examined", clean)).toBe(false);
    expect(isGrounded("Seller's caption: \"Back of a white PlayStation 5 console.\"", clean)).toBe(false);
    expect(isGrounded(`Read by the vision model: serial ${CLEAN_SERIAL} on the item`, clean)).toBe(false);
    expect(isGrounded("/fixtures/clean-ps5/front-with-box.jpg", clean)).toBe(false);
    expect(isGrounded('"whatItShows": "Barcode label on a PlayStation 5 box."', clean)).toBe(false);
    expect(isGrounded("conditionNotes: Owned from new, used in a smoke-free home.", clean)).toBe(false);
    expect(quotesPromptScaffolding("Fixed facts. Flags raised by the rules")).toBe(true);
    expect(quotesPromptScaffolding("Market range $380 to $499")).toBe(true);
    expect(quotesPromptScaffolding('Seller wrote: "Zelle works too."')).toBe(false);
    expect(quotesPromptScaffolding("Packing step not done: Photo of the console, controller and cables going into the box")).toBe(false);
  });
  it("does not accept text that merely shares a couple of words with the chat", () => {
    expect(isGrounded("I am sure that is all it takes to be good to go", clean)).toBe(false);
  });
  it("accepts a verbatim seller line even when it is short", () => {
    expect(isGrounded('Seller wrote: "Sure, one second."', clean)).toBe(true);
  });
});
