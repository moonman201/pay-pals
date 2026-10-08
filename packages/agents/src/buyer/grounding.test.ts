import { describe, expect, it } from "vitest";
import { CLEAN_SERIAL, FAKE_SLAB_CERT, cleanPs5, fakeSlab } from "@pay-pals/contracts";
import { buildGroundingCorpus, isGrounded } from "./grounding";

const clean = buildGroundingCorpus(cleanPs5.cards[1]!, cleanPs5.chat);
const slab = buildGroundingCorpus(fakeSlab.cards[0]!, fakeSlab.chat);
const chatOnly = buildGroundingCorpus(null, fakeSlab.chat);

describe("isGrounded", () => {
  it("accepts a quote from the chat, even with different quoting and case", () => {
    expect(isGrounded('Seller wrote: "Everything is on the card my pal built."', clean)).toBe(true);
    expect(isGrounded("seller said “IN THE NEXT HOUR OR IT GOES TO THE NEXT PERSON”", slab)).toBe(true);
    expect(isGrounded("seller said “first to send Friends & Family gets it”", chatOnly)).toBe(true);
  });
  it("accepts a card field with its value", () => {
    expect(isGrounded("sellerPaypalEmail: quickcash.deals.2026@example.com", slab)).toBe(true);
    expect(isGrounded("askingPrice: $750", slab)).toBe(true);
    expect(isGrounded('photos: "Front of a PSA slab on a wooden table"', slab)).toBe(true);
    expect(isGrounded(`certNumber ${FAKE_SLAB_CERT}`, slab)).toBe(true);
    expect(isGrounded(`serial ${CLEAN_SERIAL}`, clean)).toBe(true);
    expect(isGrounded(`boxSerial ${CLEAN_SERIAL}`, clean)).toBe(true);
  });
  it("rejects the model's own unanswered questions and other invented evidence", () => {
    expect(isGrounded("the seller only answered the screen question and skipped the ownership, lost-or-stolen and firmware questions your pal asked", clean)).toBe(false);
    expect(isGrounded("Seller has not said where it ships from.", clean)).toBe(false);
    expect(isGrounded("chat", clean)).toBe(false);
    expect(isGrounded("", clean)).toBe(false);
    expect(isGrounded("askingPrice: $750", chatOnly)).toBe(false);
  });
  it("does not accept text that merely shares a couple of words with the chat", () => {
    expect(isGrounded("I am sure that is all it takes to be good to go", clean)).toBe(false);
  });
  it("accepts a verbatim seller line even when it is short", () => {
    expect(isGrounded('Seller wrote: "Sure, one second."', clean)).toBe(true);
  });
});
