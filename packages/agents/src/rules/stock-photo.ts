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
import { HASH_BITS, NEAR_DUPLICATE_DISTANCE } from "../vision/phash";

export const stockPhotoRule: Rule = ({ card, photoMatches }) => {
  if (!card || !photoMatches || photoMatches.length === 0) return [];
  const best = [...photoMatches].sort((a, b) => a.distance - b.distance)[0]!;
  const others = photoMatches.length - 1;
  // Matt's line was written for the slab deal, whose card carries one photo. On a card with
  // several it would have been false, and a sentence that is true only on the scenario it was
  // written for is the kind of thing nobody notices until the demo changes.
  const whose = card.photos.length === 1 ? "His only photo" : "One of his photos";
  return [
    flag(
      "STOCK_OR_REUSED_PHOTO",
      "caution",
      // The distance is the honest part, so the sentence in front of it must hold at every
      // distance this rule fires at, which is 0 to NEAR_DUPLICATE_DISTANCE. "Exact" held only at
      // 0 and contradicted the number sitting right after it everywhere else. The threshold is
      // named so the number can actually be read: "3 of 64" means nothing without it.
      `Matches a listing photo already on file: ${best.source}. Image fingerprints differ by ${best.distance} of ${HASH_BITS} bits, and ${NEAR_DUPLICATE_DISTANCE} or fewer counts as the same picture${others > 0 ? `; ${others} more photo${others === 1 ? "" : "s"} matched too` : ""}`,
      `${whose} matches a listing photo already on file.`,
    ),
  ];
};
