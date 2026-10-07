/**
 * MarketPriceLookup backed by the scenario fixtures. Used in demos and tests
 * so no Channel3 credits are spent. Anything that is not a fixture product
 * gets an "unknown" range (0 to 0), which the price rule treats as no data.
 */
import type { MarketPriceLookup, PriceCheck } from "@pay-pals/contracts";
import { cleanGarmin, wrongItem } from "@pay-pals/contracts";

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function createFixturePriceLookup(): MarketPriceLookup {
  return {
    async priceRange(query): Promise<PriceCheck> {
      const brand = normalize(query.brand);
      const model = normalize(query.model);
      const checkedAt = new Date().toISOString();
      if (brand.includes("garmin") && model.includes("fenix 7")) {
        // The scam and clean fixtures share the Sapphire Solar range; wrong-item is the non-Sapphire Solar.
        const base = model.includes("sapphire") ? cleanGarmin.marketPrice : wrongItem.marketPrice;
        return { ...base, sources: base.sources.map((s) => ({ ...s })), checkedAt };
      }
      return { marketLow: 0, marketHigh: 0, currency: "USD", sources: [], provider: "fixture", checkedAt };
    },
  };
}
