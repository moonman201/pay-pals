/**
 * MarketPriceLookup backed by the scenario fixtures. Used in demos and tests
 * so no Channel3 credits are spent. Anything that is not a fixture product
 * gets an "unknown" range (0 to 0), which the price rule treats as no data.
 */
import type { MarketPriceLookup, PriceCheck } from "@pay-pals/contracts";
import { cleanPs5, fakeSlab } from "@pay-pals/contracts";

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function createFixturePriceLookup(): MarketPriceLookup {
  return {
    async priceRange(query): Promise<PriceCheck> {
      const brand = normalize(query.brand);
      const model = normalize(query.model);
      const checkedAt = new Date().toISOString();
      // The PS5 scenarios sell the same CFI-1015A disc edition, so they share one range. The slab has its own.
      const isPs5 = /\b(?:playstation\s*5|ps5|cfi-?1015a)\b/.test(model) || (brand.includes("sony") && /\bplaystation\b/.test(model));
      const isSlab = /\bgengar\b|\bmimikyu\b|\btag bolt\b/.test(model) || (brand.includes("pokemon") && /\bsun (?:&|and) moon\b/.test(model));
      const base = isPs5 ? cleanPs5.marketPrice : isSlab ? fakeSlab.marketPrice : null;
      if (base) return { ...base, sources: base.sources.map((s) => ({ ...s })), checkedAt };
      return { marketLow: 0, marketHigh: 0, currency: "USD", sources: [], provider: "fixture", checkedAt };
    },
  };
}
