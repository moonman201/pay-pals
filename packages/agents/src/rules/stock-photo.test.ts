/**
 * What the reused-photo flag may claim.
 *
 * The computation behind it is real: a perceptual hash of each card photo,
 * compared by Hamming distance against a corpus the caller supplies. The
 * corpus is Pay Pals' own reference set and nothing else. Nothing searches the
 * web, so "this photo is on another listing" was never checked, and that is
 * what the flag used to say on the scenario Matt leads with.
 *
 * These tests hold the distance and the evidence line exactly as they were,
 * because those were already honest, and hold the claim to what ran.
 */
import { describe, expect, it } from "vitest";
import { fakeSlab } from "@pay-pals/contracts";
import { unfoundedClaims } from "../buyer/claim-check";
import { stockPhotoRule } from "./stock-photo";

const photo = fakeSlab.cards[0]!.photos[0]!;
const match = (distance = 2) => [{ photo, source: "reference set: slab-front.jpg", distance }];
const run = (distance = 2) => stockPhotoRule({ card: fakeSlab.cards[0]!, chat: [], priceCheck: null, photoMatches: match(distance) });

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

  it("keeps the evidence line and the distance exactly as they were", () => {
    const [flag] = run(2);
    expect(flag!.evidence).toBe(
      "Matches a listing photo already on file: reference set: slab-front.jpg. Image fingerprints differ by 2 of 64 bits, and 10 or fewer counts as the same picture",
    );
    expect(flag!.code).toBe("STOCK_OR_REUSED_PHOTO");
    expect(flag!.severity).toBe("caution");
    expect(flag!.raisedByRule).toBe(true);
  });

  it("names the closest match and counts the rest, unchanged", () => {
    const flags = stockPhotoRule({
      card: fakeSlab.cards[0]!,
      chat: [],
      priceCheck: null,
      photoMatches: [
        { photo, source: "reference set: far.jpg", distance: 9 },
        { photo, source: "reference set: near.jpg", distance: 1 },
      ],
    });
    expect(flags[0]!.evidence).toContain("reference set: near.jpg. Image fingerprints differ by 1 of 64 bits");
    expect(flags[0]!.evidence).toContain("1 more photo matched too");
  });

  /**
   * The adjective in front of the number has to hold wherever the rule fires, which is every
   * distance from 0 to NEAR_DUPLICATE_DISTANCE. "Exact match" held at 0 only and contradicted the
   * number printed immediately after it everywhere else.
   */
  it.each([0, 1, 5, 10])("says nothing stronger than the distance supports at %i of 64", (distance) => {
    const [flag] = run(distance);
    expect(flag!.evidence).not.toMatch(/\bexact\b/i);
    expect(flag!.explanation).not.toMatch(/\bexact\b/i);
    expect(flag!.evidence).toContain(`differ by ${distance} of 64 bits`);
    // The threshold is named, so a reader can tell what the number means.
    expect(flag!.evidence).toContain("10 or fewer counts as the same picture");
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
