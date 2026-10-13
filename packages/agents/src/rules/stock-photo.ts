/**
 * STOCK_OR_REUSED_PHOTO: a card photo is the same picture as one Pay Pals
 * already holds. Caution. Comes only from the image check in
 * buyer/photo-match.ts, never from caption words, so with no loadable images
 * the rule is silent.
 *
 * What the check actually does, because the wording has to match it. Each card
 * photo is fetched, reduced to a perceptual hash (vision/phash.ts) and compared
 * by Hamming distance against the hashes of a corpus the caller supplies. The
 * corpus is Pay Pals' own reference set and nothing else: apps/web builds it
 * from the files it ships under public/fixtures/reference.
 *
 * So the honest claim is "this is a picture Pay Pals already holds", and the
 * honest conclusion is that the buyer has not been shown a photo taken of this
 * seller's item for this listing. The claim this used to make, that the photo
 * came "from another listing", was never checked: Pay Pals does not search the
 * web and cannot know where else a picture appears. The computation was real
 * and the sentence about it was not, which is the shape of overclaim the Oct 10
 * honesty pass exists to remove.
 */
import type { Rule } from "./types";
import { flag } from "./text";

export const stockPhotoRule: Rule = ({ card, photoMatches }) => {
  if (!card || !photoMatches || photoMatches.length === 0) return [];
  const best = [...photoMatches].sort((a, b) => a.distance - b.distance)[0]!;
  // Matt's line was written for the slab deal, whose card carries one photo. On a card with
  // several it would have been false, and a sentence that is true only on the scenario it was
  // written for is the kind of thing nobody notices until the demo changes.
  const whose = card.photos.length === 1 ? "His only photo" : "One of his photos";
  return [
    flag(
      "STOCK_OR_REUSED_PHOTO",
      "caution",
      // "Exact" holds only at distance 0. A near match, 1 to NEAR_DUPLICATE_DISTANCE bits, says
      // "Near match" instead. The fingerprint numbers are not in the quote; the reasoning's
      // "found" group carries them (buyer/review-reasons.ts).
      best.distance === 0 ? "Exact match to a listing photo already on file." : "Near match to a listing photo already on file.",
      `${whose} matches a listing photo already on file.`,
    ),
  ];
};
