/**
 * STOCK_OR_REUSED_PHOTO: the only photos are catalog style (plain white
 * background, render, stock image) or are known to be reused from another
 * listing, so none shows the seller's actual unit. Caution. Judged from the
 * photo descriptions; the model can add to this with vision.
 */
import type { Photo } from "@pay-pals/contracts";
import type { Rule } from "./types";
import { flag } from "./text";

const CATALOG =
  /\b(?:stock|render(?:ed|ing)?|catalou?g|product\s+(?:shot|image|photo)|press\s+(?:shot|image)|plain\s+white\s+background|white\s+background|manufacturer'?s?\s+(?:photo|image)|reused|same\s+photo|another\s+(?:seller|listing)|someone\s+else'?s\s+(?:photo|listing))\b/i;

function isCatalogOrReused(photo: Photo): boolean {
  return CATALOG.test(photo.whatItShows);
}

export const stockPhotoRule: Rule = ({ card }) => {
  if (!card || card.photos.length === 0) return [];
  const suspect = card.photos.filter(isCatalogOrReused);
  if (suspect.length === 0 || suspect.length < card.photos.length) return [];
  const first = suspect[0]!;
  return [
    flag(
      "STOCK_OR_REUSED_PHOTO",
      "caution",
      `photos: "${first.whatItShows}"`,
      "Every photo looks like a catalog image or one taken from another listing, so you have not actually seen the item the seller is holding.",
    ),
  ];
};
