/**
 * STOCK_OR_REUSED_PHOTO: the only photos are catalog style (plain white
 * background, render, stock image) and none shows the actual unit. Caution.
 * Judged from the photo descriptions; the model can add to this with vision.
 */
import type { Photo } from "@pay-pals/contracts";
import type { Rule } from "./types";
import { flag } from "./text";

const CATALOG = /\b(?:stock|render(?:ed|ing)?|catalou?g|product\s+(?:shot|image|photo)|press\s+(?:shot|image)|plain\s+white\s+background|white\s+background|manufacturer'?s?\s+(?:photo|image))\b/i;

function isCatalogStyle(photo: Photo): boolean {
  return CATALOG.test(photo.whatItShows);
}

export const stockPhotoRule: Rule = ({ card }) => {
  if (card.photos.length === 0) return [];
  const catalog = card.photos.filter(isCatalogStyle);
  if (catalog.length === 0 || catalog.length < card.photos.length) return [];
  const first = catalog[0]!;
  return [
    flag(
      "STOCK_OR_REUSED_PHOTO",
      "caution",
      `photos: "${first.whatItShows}"`,
      "Every photo looks like a catalog image, so you have not actually seen the item the seller is holding.",
    ),
  ];
};
