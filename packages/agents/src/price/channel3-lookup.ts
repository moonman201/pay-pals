/**
 * MarketPriceLookup backed by Channel3. One search per lookup, none when the
 * cache answers. Searches brand plus model as the query (Channel3 says to put
 * model names in the query; brand_ids would cost a second call), asks for
 * both new and used offers when the card is used, keeps the offers whose
 * titles actually match the model, and turns their prices into a range.
 *
 * Range rules, decided with the Lead on 2026-10-07 after live numbers:
 *   - percentiles: low = 20th percentile (rounded down), high = 80th
 *     (rounded up), so one odd listing does not set the range;
 *   - card condition "new": the range of all matching in-stock offers;
 *   - card condition used (anything else): Channel3 is mostly new retail,
 *     so the range is the new offers scaled by USED_FACTOR for the grade.
 *     Genuinely cheaper used offers pull the low end down, never up:
 *     low = min(scaled new low, lowest used offer), high = scaled new high.
 *     With no new offers the used offers stand as they are. The path taken
 *     is recorded as the first entry in sources so a judge can see it.
 * Responses are cached on disk for a day in dev, keyed on the normalized
 * query and the request options, so repeated runs and tests spend nothing.
 */
import type { MarketPriceLookup, PriceCheck, PriceSource } from "@pay-pals/contracts";
import {
  channel3Search,
  type Channel3Offer,
  type Channel3Product,
  type Channel3SearchRequest,
  type Channel3SearchResponse,
  type FetchLike,
} from "./channel3-api";
import { createDiskCache, noCache, type DiskCache } from "./disk-cache";

export interface Channel3Options {
  fetchImpl?: FetchLike;
  cache?: DiskCache;
  /** Results per search, 1 to 30. */
  limit?: number;
}

/** Share of the new retail price a used unit fetches, by condition grade. */
export const USED_FACTOR: Record<string, number> = {
  new: 1,
  like_new: 0.8,
  good: 0.7,
  fair: 0.55,
  for_parts: 0.3,
};

/** Prefix of the sources entry that records how a used range was derived. */
export const ESTIMATE_NOTE_PREFIX = "Estimated for a used unit";

const MAX_SOURCES = 8;

export function normalizeQuery(brand: string, model: string): string {
  return `${brand} ${model}`.toLowerCase().replace(/\s+/g, " ").trim();
}

export function buildSearchRequest(query: { brand: string; model: string; condition: string }, limit: number): Channel3SearchRequest {
  const used = query.condition !== "new";
  return {
    query: normalizeQuery(query.brand, query.model),
    limit: Math.min(30, Math.max(1, limit)),
    ...(used ? { filters: { conditions: ["new", "used"] as const } } : {}),
    config: { country: "US", currency: "USD" },
  };
}

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

interface PricedOffer {
  product: Channel3Product;
  offer: Channel3Offer;
}

function rangeOf(offers: PricedOffer[]): { low: number; high: number } {
  const prices = offers.map((o) => o.offer.price.price).sort((a, b) => a - b);
  return { low: percentile(prices, 0.2, "low"), high: percentile(prices, 0.8, "high") };
}

function percentLabel(factor: number): string {
  return `${Math.round(factor * 100)}% of new`;
}

export function deriveRange(
  response: Channel3SearchResponse,
  query: { brand: string; model: string; condition: string },
): Omit<PriceCheck, "checkedAt"> {
  const products = relevantProducts(response.products, query.brand, query.model);
  const offers: PricedOffer[] = [];
  for (const product of products) {
    for (const offer of product.offers ?? []) {
      if (offer.price.currency === "USD" && offer.price.price > 0) offers.push({ product, offer });
    }
  }
  const inStock = offers.filter((o) => o.offer.availability === "InStock");
  const pool = inStock.length > 0 ? inStock : offers;

  const sources: PriceSource[] = pool.slice(0, MAX_SOURCES).map(({ product, offer }) => ({
    name: `${offer.domain}: ${product.title}`.slice(0, 120),
    url: offer.url,
    price: offer.price.price,
    condition: offer.condition ?? "new",
  }));

  const isUsedCard = query.condition !== "new";
  const factor = USED_FACTOR[query.condition] ?? 1;
  const newOffers = pool.filter((o) => o.offer.condition !== "used");
  const usedOffers = pool.filter((o) => o.offer.condition === "used");

  let low: number;
  let high: number;
  let note: string | null = null;
  if (!isUsedCard || pool.length === 0) {
    ({ low, high } = rangeOf(pool));
  } else if (newOffers.length > 0) {
    const scaled = rangeOf(newOffers);
    const lowestUsed = usedOffers.length > 0 ? Math.min(...usedOffers.map((o) => o.offer.price.price)) : Number.POSITIVE_INFINITY;
    low = Math.min(scaled.low * factor, lowestUsed);
    high = scaled.high * factor;
    note =
      lowestUsed < scaled.low * factor
        ? `${ESTIMATE_NOTE_PREFIX} from new retail prices (${query.condition.replace("_", " ")}: ${percentLabel(factor)}); a cheaper used offer at $${lowestUsed} set the low end`
        : `${ESTIMATE_NOTE_PREFIX} from new retail prices (${query.condition.replace("_", " ")}: ${percentLabel(factor)})`;
  } else {
    ({ low, high } = rangeOf(usedOffers));
    note = `${ESTIMATE_NOTE_PREFIX} from used offers only`;
  }

  return {
    marketLow: round(low),
    marketHigh: round(high),
    currency: "USD",
    sources: note ? [{ name: note }, ...sources] : sources,
    provider: "channel3",
  };
}

export function createChannel3PriceLookup(apiKey: string, options: Channel3Options = {}): MarketPriceLookup {
  const cache = options.cache ?? (process.env.NODE_ENV === "production" ? noCache : createDiskCache());
  const limit = options.limit ?? 20;
  return {
    async priceRange(query): Promise<PriceCheck> {
      const request = buildSearchRequest(query, limit);
      let response = await cache.get<Channel3SearchResponse>(request);
      if (!response) {
        response = await channel3Search(apiKey, request, options.fetchImpl);
        await cache.set(request, response);
      }
      return { ...deriveRange(response, query), checkedAt: new Date().toISOString() };
    },
  };
}
