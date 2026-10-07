/**
 * PRICE_FAR_BELOW_MARKET: the asking price is far under the low end of the
 * market range. Thresholds, chosen here and nowhere else:
 *   under 60% of marketLow  -> stop     (a $180 ask on a $420 floor is 43%)
 *   under 75% of marketLow  -> caution  (cheap enough to ask why)
 * A price check with marketLow of 0 means "unknown" and raises nothing.
 */
import type { Rule } from "./types";
import { flag } from "./text";

export const STOP_RATIO = 0.6;
export const CAUTION_RATIO = 0.75;

export const priceBelowMarketRule: Rule = ({ card, priceCheck }) => {
  if (!priceCheck || priceCheck.marketLow <= 0) return [];
  const ratio = card.askingPrice / priceCheck.marketLow;
  if (ratio >= CAUTION_RATIO) return [];

  const percent = Math.round(ratio * 100);
  const evidence = `askingPrice: $${card.askingPrice} against a market low of $${priceCheck.marketLow} (${percent}% of the low end, source ${priceCheck.provider})`;
  if (ratio < STOP_RATIO) {
    return [
      flag(
        "PRICE_FAR_BELOW_MARKET",
        "stop",
        evidence,
        `This is priced at about ${percent}% of the lowest real listings, which is the pattern of a listing that will never ship.`,
      ),
    ];
  }
  return [
    flag(
      "PRICE_FAR_BELOW_MARKET",
      "caution",
      evidence,
      `This is well under the market range, so ask the seller why before you pay.`,
    ),
  ];
};
