/**
 * Where the asking price sits against the range the Buyer Pal used, and the two or three words that say it.
 *
 * This mirrors packages/agents/src/price/price-position.ts, because the client bundle cannot import the
 * agents package (it pulls in Node-only code). price-stance.test.ts pins it to the agents' own functions
 * and to the constants they use, the way headline.ts is pinned to goHeadline, so the two cannot drift.
 *
 * It judges nothing the pal did not. The range is the price check's own marketLow and marketHigh, which
 * is the band the pal's price sentence and the PRICE_FAR_BELOW_MARKET rule are measured against. For a
 * used item that band is the used-equivalent one (the provider scales new retail prices down, or uses
 * used listings), so "inside" is inside the used range. A graded card has no price check to speak of and
 * gets nothing here.
 */
import type { ItemCard, PriceCheck } from "@pay-pals/contracts";
import { isGradedCard } from "./graded-price";
import { hasUsableRange } from "./price-copy";

export type PricePosition = "inside" | "just_under" | "under" | "above";

/** The share of the low end below which the rule has its own flag. Mirrors CAUTION_RATIO in the agents' price rule. */
export const CAUTION_RATIO = 0.75;

/** What the lookup's note starts with when it scaled new retail prices down to a used band. Mirrors the agents' channel3-lookup. */
export const ESTIMATE_NOTE_PREFIX = "Estimated for a used unit";

export function pricePosition(ask: number, low: number, high: number): PricePosition {
  if (ask > high) return "above";
  if (ask >= low) return "inside";
  return ask / low >= CAUTION_RATIO ? "just_under" : "under";
}

/** "sits inside", "is just under", "is under" or "is above": the verb the pal's own sentence uses. */
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

export interface PriceStance {
  position: PricePosition;
  /** True when the range is a used-item band: the card is not new. */
  usedRange: boolean;
  /** The chip and the short verdict: "Fair used price", "Just under used range", "Above range". */
  label: string;
  tone: "go" | "caution";
  /** "The $420 ask sits inside the $380 to $499 used range." */
  sentence: string;
}

const USED_LABELS: Record<PricePosition, string> = {
  inside: "Fair used price",
  just_under: "Just under used range",
  under: "Under used range",
  above: "Above used range",
};

const NEW_LABELS: Record<PricePosition, string> = {
  inside: "In price range",
  just_under: "Just under range",
  under: "Under range",
  above: "Above range",
};

/** Null when there is nothing honest to say: a graded card, no price check, or a range with no width. */
export function priceStance(check: PriceCheck | null | undefined, card: ItemCard | null | undefined): PriceStance | null {
  if (!card || !hasUsableRange(check)) return null;
  if (isGradedCard(card)) return null;
  const position = pricePosition(card.askingPrice, check.marketLow, check.marketHigh);
  const usedRange = card.conditionGrade !== "new";
  return {
    position,
    usedRange,
    label: (usedRange ? USED_LABELS : NEW_LABELS)[position],
    tone: position === "inside" ? "go" : "caution",
    sentence: `The $${card.askingPrice} ask ${pricePositionVerb(position)} the $${check.marketLow} to $${check.marketHigh} ${usedRange ? "used " : ""}range.`,
  };
}
