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
  const others = photoMatches.length - 1;
  return [
    flag(
      "STOCK_OR_REUSED_PHOTO",
      "caution",
      // Plain sentence first, since this is the line the room shows; the precise source and
      // distance follow it, because evidence is where that precision belongs (Oct 11 rule 6).
      `Exact match to a listing photo already on file. ${best.source}, ${best.distance} of 64 points differ${others > 0 ? `; ${others} more photo${others === 1 ? "" : "s"} matched too` : ""}`,
      "His only photo matches a listing photo already on file.",
    ),
  ];
};
