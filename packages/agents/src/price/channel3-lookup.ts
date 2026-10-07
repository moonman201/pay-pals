/**
 * MarketPriceLookup backed by Channel3. Searches for the product, keeps the
 * offers whose titles actually match the model, and turns their prices into
 * a low/high range. How the range is derived, in one place:
 *   - low  = 20th percentile of matching USD offers, high = 80th percentile,
 *     so one mispriced listing does not set the range;
 *   - Channel3 is mostly retail (new). When the card is used and no used
 *     offers came back, both ends are scaled by USED_FACTOR for the grade.
 * Responses are cached on disk in dev so tests do not spend credits.
 */
import type { MarketPriceLookup, PriceCheck, PriceSource } from "@pay-pals/contracts";
import { channel3Search, type Channel3Offer, type Channel3Product, type Channel3SearchResponse, type FetchLike } from "./channel3-api";
import { createDiskCache, noCache, type DiskCache } from "./disk-cache";

export interface Channel3Options {
  fetchImpl?: FetchLike;
  cache?: DiskCache;
  limit?: number;
}

/** Share of the retail price a used unit fetches, by condition grade. */
export const USED_FACTOR: Record<string, number> = {
  new: 1,
  like_new: 0.8,
  good: 0.7,
  fair: 0.55,
  for_parts: 0.3,
};

const MAX_SOURCES = 8;

function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
}

/** Products whose title carries the brand and at least half of the model tokens. Falls back to every product. */
export function relevantProducts(products: Channel3Product[], brand: string, model: string): Channel3Product[] {
  const modelTokens = tokens(model);
  const needed = Math.max(1, Math.ceil(modelTokens.length / 2));
  const brandToken = brand.toLowerCase().trim();
  const scored = products.filter((p) => {
    const title = p.title.toLowerCase();
    const brandOk = brandToken.length === 0 || title.includes(brandToken) || (p.brands ?? []).some((b) => b.name.toLowerCase() === brandToken);
    const hits = modelTokens.filter((t) => title.includes(t)).length;
    return brandOk && hits >= needed;
  });
  return scored.length > 0 ? scored : products;
}

/** Low end rounds down, high end rounds up, so a small sample gives a wider range rather than a narrower one. */
function percentile(sorted: number[], p: number, edge: "low" | "high"): number {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * p;
  const index = edge === "low" ? Math.floor(position) : Math.ceil(position);
  return sorted[Math.min(sorted.length - 1, Math.max(0, index))]!;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function deriveRange(
  response: Channel3SearchResponse,
  query: { brand: string; model: string; condition: string },
): Omit<PriceCheck, "checkedAt"> {
  const products = relevantProducts(response.products, query.brand, query.model);
  const offers: Array<{ product: Channel3Product; offer: Channel3Offer }> = [];
  for (const product of products) {
    for (const offer of product.offers) {
      if (offer.price.currency === "USD" && offer.price.price > 0) offers.push({ product, offer });
    }
  }
  const inStock = offers.filter((o) => o.offer.availability === "InStock");
  const pool = inStock.length > 0 ? inStock : offers;
  const prices = pool.map((o) => o.offer.price.price).sort((a, b) => a - b);

  const anyUsed = pool.some((o) => o.offer.condition === "used");
  const factor = anyUsed ? 1 : (USED_FACTOR[query.condition] ?? 1);

  const sources: PriceSource[] = pool.slice(0, MAX_SOURCES).map(({ product, offer }) => ({
    name: `${offer.domain}: ${product.title}`.slice(0, 120),
    url: offer.url,
    price: offer.price.price,
    condition: offer.condition ?? "new",
  }));

  return {
    marketLow: round(percentile(prices, 0.2, "low") * factor),
    marketHigh: round(percentile(prices, 0.8, "high") * factor),
    currency: "USD",
    sources,
    provider: "channel3",
  };
}

export function createChannel3PriceLookup(apiKey: string, options: Channel3Options = {}): MarketPriceLookup {
  const cache = options.cache ?? (process.env.NODE_ENV === "production" ? noCache : createDiskCache());
  const limit = options.limit ?? 20;
  return {
    async priceRange(query): Promise<PriceCheck> {
      const request = { query: `${query.brand} ${query.model}`.trim(), limit, config: { country: "US" as const, currency: "USD" as const } };
      let response = await cache.get<Channel3SearchResponse>(request);
      if (!response) {
        response = await channel3Search(apiKey, request, options.fetchImpl);
        await cache.set(request, response);
      }
      return { ...deriveRange(response, query), checkedAt: new Date().toISOString() };
    },
  };
}
