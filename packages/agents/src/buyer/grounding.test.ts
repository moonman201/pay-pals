import { describe, expect, it } from "vitest";
import { cleanGarmin, scamGarmin } from "@pay-pals/contracts";
import { buildGroundingCorpus, isGrounded } from "./grounding";

const clean = buildGroundingCorpus(cleanGarmin.cards[1]!, cleanGarmin.chat);
const scam = buildGroundingCorpus(scamGarmin.cards[0]!, scamGarmin.chat);

describe("isGrounded", () => {
  it("accepts a quote from the chat, even with different quoting and case", () => {
    expect(isGrounded('Seller wrote: "Everything is on the card my pal built."', clean)).toBe(true);
    expect(isGrounded("seller said “ZELLE WORKS TOO”", scam)).toBe(true);
  });
  it("accepts a card field with its value", () => {
    expect(isGrounded("sellerPaypalEmail: quickcash.deals.2026@example.com", scam)).toBe(true);
    expect(isGrounded("askingPrice: $180", scam)).toBe(true);
    expect(isGrounded('photos: "Front of the watch on a plain white background"', scam)).toBe(true);
    expect(isGrounded(`serial ${cleanGarmin.cards[0]!.serial}`, clean)).toBe(true);
  });
  it("rejects the model's own unanswered questions and other invented evidence", () => {
    expect(isGrounded("the seller only answered the battery question and skipped the ownership, lost-or-stolen and firmware questions your pal asked", clean)).toBe(false);
    expect(isGrounded("Seller has not said where it ships from.", clean)).toBe(false);
    expect(isGrounded("chat", clean)).toBe(false);
    expect(isGrounded("", clean)).toBe(false);
  });
  it("does not accept text that merely shares a couple of words with the chat", () => {
    expect(isGrounded("I am sure that is all it takes to be good to go", clean)).toBe(false);
  });
  it("accepts a verbatim seller line even when it is short", () => {
    expect(isGrounded('Seller wrote: "Sure, one second."', clean)).toBe(true);
  });
});
