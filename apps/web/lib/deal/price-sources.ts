/**
 * What the price check shows about the listings behind the range: how many
 * there were, how they split between new and used, and the prices
 * themselves. Never the shop a listing came from, which is Matt's call of
 * Oct 9: the numbers carry the check, the names add nothing and name other
 * companies on the page.
 */
import type { PriceCheck, PriceSource } from "@pay-pals/contracts";

export interface SourceSummary {
  /** How many listings the check looked at. */
  count: number;
  /** "From 8 listings: 6 new, 2 used, $588.99 to $914.99". */
  line: string;
  /** The listing prices, lowest first, for the chips under the line. */
  prices: number[];
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

export function summariseSources(check: PriceCheck | null | undefined): SourceSummary | null {
  const sources: readonly PriceSource[] = check?.sources ?? [];
  if (sources.length === 0) return null;
  const prices = sources
    .map((s) => s.price)
    .filter((p): p is number => typeof p === "number" && p > 0)
    .sort((a, b) => a - b);
  const newCount = sources.filter((s) => conditionBucket(s.condition) === "new").length;
  const usedCount = sources.filter((s) => conditionBucket(s.condition) === "used").length;
  const parts: string[] = [];
  if (newCount > 0) parts.push(`${newCount} new`);
  if (usedCount > 0) parts.push(`${usedCount} used`);
  if (prices.length > 0) {
    const low = prices[0]!;
    const high = prices[prices.length - 1]!;
    parts.push(low === high ? money(low) : `${money(low)} to ${money(high)}`);
  }
  const line = parts.length > 0 ? `From ${countWord(sources.length)}: ${parts.join(", ")}` : `From ${countWord(sources.length)}`;
  return { count: sources.length, line, prices };
}
