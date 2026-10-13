/**
 * Where an asking price sits against a market range, in words that are true.
 * "Inside the range" used to be printed for any price that was not above the
 * high end, so a $410 ask against a $412.29 low read as inside. One place
 * decides, and both pal sentences (review reasons, verdict message) use it.
 *
 * "Just under" is a price within the caution threshold of the low end, the
 * band the PRICE_FAR_BELOW_MARKET rule leaves alone. Below that the rule has
 * its own flag, and the sentence says plain "under".
 */
import { CAUTION_RATIO } from "../rules/price-below-market";

export type PricePosition = "inside" | "just_under" | "under" | "above";

export function pricePosition(ask: number, low: number, high: number): PricePosition {
  if (ask > high) return "above";
  if (ask >= low) return "inside";
  return ask / low >= CAUTION_RATIO ? "just_under" : "under";
}

/** "sits inside", "is just under", "is under" or "is above", to follow the subject of the sentence. */
export function pricePositionVerb(position: PricePosition): string {
  switch (position) {
    case "inside":
      return "sits inside";
    case "just_under":
      return "is just under";
    case "under":
      return "is under";
    case "above":
      return "is above";
  }
}
