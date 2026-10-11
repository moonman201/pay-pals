/**
 * What the price check shows about the listings behind the range: how many
 * there were, how they split between new and used, and the prices
 * themselves. Never the shop a listing came from, which is Matt's call of
 * Oct 9: the numbers carry the check, the names add nothing and name other
 * companies on the page.
 */
import type { PriceCheck, PriceSource } from "@pay-pals/contracts";

export interface SourceSummary {
  /** How many listings the check looked at. Only the sources carrying a price: see methodNote. */
  count: number;
  /** "From 8 listings: 6 new, 2 used, $588.99 to $914.99". */
  line: string;
  /** The listing prices, lowest first, for the chips under the line. */
  prices: number[];
}

/**
 * The retail range the lookup actually returned, which is not the same
 * number as the check's marketLow and marketHigh.
 *
 * marketLow and marketHigh are derived: for a used item the provider scales
 * new retail prices down to a used-equivalent band, so that band appears in
 * no listing anywhere. This is the other figure, the one a reader can go and
 * check: the lowest and highest of the new listings themselves.
 *
 * Both belong on the page. This one is the comparison a buyer can verify;
 * the derived band is the like-for-like estimate for a used unit, and the
 * method note says how it was reached.
 */
export interface RetailRange {
  low: number;
  high: number;
  /** How many new listings it came from. The method note carries no price, so it is never one of them. */
  count: number;
  /** "$588.99 to $914.99", or one price when every new listing agreed. */
  text: string;
  /** "across 11 new listings". */
  countLine: string;
}

/** A source that is a sentence about the range rather than a listing: no price and no url. */
function isNote(source: PriceSource): boolean {
  return source.price === undefined && source.url === undefined && source.name.trim() !== "";
}

/**
 * One of the sources can be the lookup's note on how the range was reached
 * rather than a listing: it carries a sentence and neither a price nor a
 * url. That sentence is what lets a reader check a scaled figure against
 * the listings under it, so the panel shows it, and it is never counted as
 * a listing.
 *
 * Take the first note that exists, not the note on the first source. The
 * live Channel3 lookup puts its note first, but the slab fixture carries its
 * reference sentence last, and reading only position 0 meant that sentence
 * never rendered (REVIEW, Oct 9).
 */
export function methodNote(check: PriceCheck | null | undefined): string | null {
  return check?.sources.find(isNote)?.name.trim() ?? null;
}

/** The sources that are listings: the ones with a price on them. */
function listings(sources: readonly PriceSource[]): PriceSource[] {
  return sources.filter((s) => typeof s.price === "number" && s.price > 0);
}

/** A listing is new only when it says so plainly. "Like new" is a used item. */
export function conditionBucket(condition: string | undefined): "new" | "used" | "unknown" {
  const text = condition?.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!text) return "unknown";
  if (text === "new" || text === "brand new") return "new";
  return "used";
}

function countWord(n: number): string {
  return `${n} ${n === 1 ? "listing" : "listings"}`;
}

function money(n: number): string {
  return `$${n}`;
}

/** "$588.99", always two places, so the asking price and the range line up as a comparison. */
export function priceText(n: number): string {
  return `$${n.toFixed(2)}`;
}

/**
 * The lowest and highest new listing the lookup returned, or null when it
 * returned none.
 *
 * Same two guards as everywhere else in this file, for the same reasons: a
 * source with no price is not a listing, which keeps the method note out of
 * both the count and the range, and a zero price is not a price.
 */
export function retailRange(check: PriceCheck | null | undefined): RetailRange | null {
  const sources = listings(check?.sources ?? []).filter((s) => conditionBucket(s.condition) === "new");
  if (sources.length === 0) return null;
  const prices = sources.map((s) => s.price!).sort((a, b) => a - b);
  const low = prices[0]!;
  const high = prices[prices.length - 1]!;
  return {
    low,
    high,
    count: sources.length,
    // One price when every new listing agreed, never "$588.99 to $588.99".
    text: low === high ? priceText(low) : `${priceText(low)} to ${priceText(high)}`,
    countLine: `across ${sources.length} new ${sources.length === 1 ? "listing" : "listings"}`,
  };
}

export function summariseSources(check: PriceCheck | null | undefined): SourceSummary | null {
  // Count the listings, not the sources: the lookup puts its method note in the same array.
  const sources = listings(check?.sources ?? []);
  if (sources.length === 0) return null;
  const prices = sources.map((s) => s.price!).sort((a, b) => a - b);
  const newCount = sources.filter((s) => conditionBucket(s.condition) === "new").length;
  const usedCount = sources.filter((s) => conditionBucket(s.condition) === "used").length;
  const parts: string[] = [];
  if (newCount > 0) parts.push(`${newCount} new`);
  if (usedCount > 0) parts.push(`${usedCount} used`);
  const low = prices[0]!;
  const high = prices[prices.length - 1]!;
  parts.push(low === high ? money(low) : `${money(low)} to ${money(high)}`);
  return { count: sources.length, line: `From ${countWord(sources.length)}: ${parts.join(", ")}`, prices };
}
