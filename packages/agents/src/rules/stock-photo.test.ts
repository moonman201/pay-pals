/**
 * What the reused-photo flag may claim.
 *
 * The computation behind it is real: a perceptual hash of each card photo,
 * compared by Hamming distance against a corpus the caller supplies. The
 * corpus is Pay Pals' own reference set and nothing else. Nothing searches the
 * web, so "this photo is on another listing" was never checked, and that is
 * what the flag used to say on the scenario Matt leads with.
 *
 * These tests hold the evidence line to one plain sentence, keep the
 * fingerprint numbers in the reasoning, and hold the claim to what ran.
 */
import { describe, expect, it } from "vitest";
import { fakeSlab } from "@pay-pals/contracts";
import { unfoundedClaims } from "../buyer/claim-check";
import { stockPhotoRule } from "./stock-photo";
import { reviewReasoning } from "../buyer/review-reasons";

const photo = fakeSlab.cards[0]!.photos[0]!;
const match = (distance = 2) => [{ photo, source: "reference set: slab-front.jpg", distance }];
const run = (distance = 2) => stockPhotoRule({ card: fakeSlab.cards[0]!, chat: [], priceCheck: null, photoMatches: match(distance) });

const foundReasons = (o: { flags: ReturnType<typeof run>; photoMatches: ReturnType<typeof match> }) =>
  reviewReasoning({
    card: fakeSlab.cards[0]!,
    priceCheck: null,
    certCheck: null,
    certLookupFailed: false,
    readings: [],
    flags: o.flags,
    overall: "caution",
    seller: null,
    photoMatchRan: true,
    photoMatches: o.photoMatches,
    modelAvailable: false,
    serialReadFromPhoto: false,
  }).found;

/** Claims nothing in this package can support, because nothing searches for a picture. */
const NEVER = [/another listing/i, /other listings/i, /\bonline\b/i, /\binternet\b/i, /\bweb\b/i, /\bstolen\b/i, /somewhere else/i];

describe("the reused-photo flag claims only what the check did", () => {
  it("says the picture is one Pay Pals holds, and never that it came from another listing", () => {
    const [flag] = run();
    expect(flag!.explanation).toBe("His only photo matches a listing photo already on file.");
    expect(fakeSlab.cards[0]!.photos).toHaveLength(1);
    for (const pattern of NEVER) expect(flag!.explanation, `explanation must not match ${pattern}`).not.toMatch(pattern);
  });

  it("still draws the conclusion that matters to the buyer", () => {
    // The conclusion now lives in one place, the reason line, and the limit lives in couldNotVerify.
    expect(run()[0]!.explanation.split(/\s+/).length).toBeLessThanOrEqual(12);
  });

  it("quotes the evidence as one plain sentence with no fingerprint numbers", () => {
    const [flag] = run(0);
    expect(flag!.evidence).toBe("Exact match to a listing photo already on file.");
    expect(flag!.evidence).not.toMatch(/\d|bits|fingerprint/i);
    expect(flag!.code).toBe("STOCK_OR_REUSED_PHOTO");
    expect(flag!.severity).toBe("caution");
    expect(flag!.raisedByRule).toBe(true);
    for (const pattern of NEVER) expect(flag!.evidence, `evidence must not match ${pattern}`).not.toMatch(pattern);
  });

  it("says near match, not exact, when the fingerprints are close but not identical", () => {
    // "Exact" holds at 0 bits only. At 1 to 10 the picture is the same one to the eye, not the same file.
    for (const distance of [1, 5, 10]) {
      const [flag] = run(distance);
      expect(flag!.evidence).toBe("Near match to a listing photo already on file.");
      expect(flag!.evidence).not.toMatch(/\bexact\b/i);
      expect(flag!.explanation).not.toMatch(/\bexact\b/i);
    }
  });

  it("keeps the fingerprint detail in the reasoning, with the threshold that gives it meaning", () => {
    const reasons = foundReasons({ flags: run(0), photoMatches: match(0) });
    expect(reasons).toContain("Closest photo on file: reference set: slab-front.jpg. The image fingerprints differ by 0 of 64 bits, and 10 or fewer counts as the same picture.");
  });

  it("does not call a multi-photo card's match its only photo", () => {
    // Matt's wording was written for the one-photo slab card. On this one it would be false.
    const manyPhotos = { ...fakeSlab.cards[0]!, photos: [photo, { ...photo, url: "b.jpg" }, { ...photo, url: "c.jpg" }] };
    const [flag] = stockPhotoRule({ card: manyPhotos, chat: [], priceCheck: null, photoMatches: match(0) });
    expect(flag!.explanation).toBe("One of his photos matches a listing photo already on file.");
  });

  it("is silent with no matches, because the check is the only thing that raises it", () => {
    expect(stockPhotoRule({ card: fakeSlab.cards[0]!, chat: [], priceCheck: null, photoMatches: [] })).toEqual([]);
    expect(stockPhotoRule({ card: fakeSlab.cards[0]!, chat: [], priceCheck: null })).toEqual([]);
  });
});

describe("the honesty guard catches the old claim if a model writes it again", () => {
  const context = { imagesRead: true, psaContacted: true, certCheck: null };

  it.each([
    "This photo was found on another listing, so the seller did not take it.",
    "The same picture appears online.",
    "A reverse image search turned it up.",
    "The photo was taken from the internet.",
    "That picture comes from a different listing.",
  ])("rejects: %s", (text) => {
    expect(unfoundedClaims(text, context).length).toBeGreaterThan(0);
  });

  it("allows the claim the check can support", () => {
    expect(unfoundedClaims("This is the same picture as one Pay Pals already holds, so you have not seen the seller's own item.", context)).toEqual([]);
  });

  it("does not trip on the price line, which legitimately counts listings", () => {
    expect(unfoundedClaims("The $420 ask sits inside the range, from 3 listings (2 used, 1 new).", context)).toEqual([]);
  });
});
