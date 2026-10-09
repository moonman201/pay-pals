/**
 * STOCK_OR_REUSED_PHOTO: a card photo is the same picture as a photo from
 * somewhere else (another deal, a reference set). Caution. Comes only from
 * the image check in buyer/photo-match.ts, never from caption words, so with
 * no loadable images the rule is silent.
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
      `Photo "${best.photo.whatItShows}" is the same picture as ${best.source} (${best.distance} of 64 bits differ)${others > 0 ? `; ${others} more photo${others === 1 ? "" : "s"} matched too` : ""}`,
      "A photo on this card is the same picture as one from another listing, so you have not seen the seller's own item.",
    ),
  ];
};
