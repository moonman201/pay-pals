/**
 * MarketPriceLookup backed by Channel3. One search per lookup, none when the
 * cache answers. Searches brand plus model as the query, asks for both new
 * and used offers when the card is used, keeps only listings that are the
 * same item, and turns their prices into a range.
 *
 * Relevance (decided with the Lead on 2026-10-07 after the live review):
 *   - listings are deduplicated by domain, normalized title, price and
 *     condition; bundles ("bundle", "+", "with two controllers", "and game",
 *     "lot of") and accessories the item is not (controller, case, binder,
 *     plush, ...) are dropped;
 *   - a listing must name every required word of the model (set and
 *     character for a card, product name and edition for a console);
 *   - "same model" listings name the model code (CFI-1015A) or the exact
 *     edition with no other variant word; "family" listings are the same
 *     product in another variant (Slim, Pro, Digital). The range uses the
 *     same-model listings and widens to the family only when fewer than
 *     three same-model listings exist, saying so in the note;
 *   - a graded card compares only with listings naming the same grader and
 *     grade, and the used-from-new discount never applies to it;
 *   - fewer than three relevant listings, or a range whose low equals its
 *     high, returns the unknown range with the note "No reliable market
 *     price found". A range is never built from one listing.
 *
 * Range maths, rewritten on 2026-10-09 after the live panel showed a headline
 * no listing supported. The rule now is that the range is the range of the
 * listings published beside it, so a reader can check one against the other:
 *   - the listings the range is drawn from are exactly the listings in
 *     sources, sorted cheapest first. Nothing is derived from a listing the
 *     panel does not show, and no listing without a price is ever in there;
 *   - low is the cheapest of those listings and high the dearest. No
 *     percentile, because a percentile picks a number out of the middle and
 *     the reader cannot see why;
 *   - for a used card the new offers are scaled by USED_FACTOR, so the
 *     headline is deliberately not a listing price. The note then says the
 *     factor and the new-stock range it was scaled from, in the same breath,
 *     so the arithmetic is there to check. A genuinely cheaper used offer
 *     pulls the low end down (never up), and used offers stand alone only
 *     when no new offers came back;
 *   - MAX_SOURCES caps how many listings are published. When more come back
 *     the dearest are dropped, the cheapest are kept, and the note says so.
 * The path taken is recorded as the first sources entry, which is the only
 * entry without a price, so a judge can see how the number was reached.
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
import { createDiskCache, noCache, type DiskCache } from "../cache/disk-cache";

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

export const MIN_LISTINGS = 3;
export const ESTIMATE_NOTE_PREFIX = "Estimated for a used unit";
export const NO_RELIABLE_PRICE_NOTE = "No reliable market price found";
/** How many listings the panel publishes, and so how many the range may be drawn from. Twelve covers a full live PS5 result. */
export const MAX_SOURCES = 12;

const GRADER = /\b(psa|bgs|cgc|sgc)\s*-?\s*(10|[1-9](?:\.5)?)\b/i;
const BUNDLE = /\bbundles?\b|\+|\bwith\s+(?:2|two|3|three|\d+)\s+controllers?\b|\band\s+games?\b|\bgames?\s+(?:bundle|included)\b|\blots?\s+of\b|\bset\s+of\s+\d|\bpack\s+of\s+\d|\bmystery\b/i;
const ACCESSORY =
  /\b(?:controllers?|chargers?|charging|stands?|covers?|skins?|cases?|protectors?|sleeves?|binders?|portfolios?|deck\s*box(?:es)?|plush|plushies?|figures?|t-?shirts?|hoodies?|tins?|boosters?|posters?|stickers?|cables?|headsets?|mounts?|docks?|nanoblocks?|keychains?|toppers?|wall\s+art)\b/i;
const VARIANTS = ["slim", "pro", "digital", "lite", "mini", "ultra"];
const GENERIC = new Set(["the", "and", "with", "for", "of", "new", "used", "edition", "console", "card", "cards", "holo", "graded", "slab", "sealed", "psa", "bgs", "cgc", "sgc", "version", "model"]);

export function normalizeQuery(brand: string, model: string): string {
  return `${brand} ${model}`.toLowerCase().replace(/\s+/g, " ").trim();
}

/** True when the query is for a graded collectible (a grader and grade, or the words graded or slab). */
export function isGradedQuery(model: string): boolean {
  return GRADER.test(model) || /\bgraded\b|\bslab\b/i.test(model);
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

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function squash(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Tokens that look like a model code: CFI-1015A, SM-G998U, 1TB stays out (too short a prefix). */
export function modelCodes(model: string): string[] {
  return model
    .split(/[\s,]+/)
    .filter((t) => /^[a-z]{2,}-?\d{3,}[a-z]?$/i.test(t))
    .map(squash);
}

/** Words a listing must contain to be the same item: letters only, three or more, not generic, not part of a code or grade. */
export function requiredWords(model: string): string[] {
  const codeParts = new Set(
    model
      .split(/[\s,]+/)
      .filter((t) => /^[a-z]{2,}-?\d{3,}[a-z]?$/i.test(t))
      .flatMap((t) => normalizeTitle(t).split(" ")),
  );
  return [...new Set(normalizeTitle(model).split(" "))].filter((t) => /^[a-z]+$/.test(t) && t.length >= 3 && !GENERIC.has(t) && !VARIANTS.includes(t) && !codeParts.has(t));
}

export type Tier = "same" | "family";

/** Which tier a listing title falls in for this model, or null when it is not the same item. */
export function classifyTitle(title: string, model: string, graded: boolean): Tier | null {
  if (BUNDLE.test(title)) return null;
  const t = normalizeTitle(title);
  const words = new Set(t.split(" "));
  const modelWords = new Set(normalizeTitle(model).split(" "));
  const accessory = title.match(ACCESSORY);
  if (accessory && !modelWords.has(normalizeTitle(accessory[0]!))) return null;
  for (const word of requiredWords(model)) if (!words.has(word)) return null;

  if (graded) {
    const want = model.match(GRADER);
    const have = title.match(GRADER);
    if (!want || !have || want[1]!.toLowerCase() !== have[1]!.toLowerCase() || want[2] !== have[2]) return null;
    return "same";
  }

  // The model code names the exact model. Without it, the exact edition with no other variant word is still the same model;
  // another variant (Slim, Pro) is the family.
  const codes = modelCodes(model);
  const squashed = squash(title);
  if (codes.length > 0 && codes.some((c) => squashed.includes(c))) return "same";
  const foreignVariant = VARIANTS.some((v) => words.has(v) && !modelWords.has(v));
  return foreignVariant ? "family" : "same";
}

interface Listing {
  product: Channel3Product;
  offer: Channel3Offer;
  tier: Tier;
}

export function relevantListings(products: Channel3Product[], model: string, graded: boolean): Listing[] {
  const seen = new Set<string>();
  const listings: Listing[] = [];
  for (const product of products) {
    const tier = classifyTitle(product.title, model, graded);
    if (!tier) continue;
    for (const offer of product.offers ?? []) {
      if (offer.price.currency !== "USD" || !(offer.price.price > 0)) continue;
      const key = `${offer.domain}|${normalizeTitle(product.title)}|${offer.price.price}|${offer.condition ?? "new"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      listings.push({ product, offer, tier });
    }
  }
  const inStock = listings.filter((l) => l.offer.availability === "InStock");
  return inStock.length > 0 ? inStock : listings;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function money(value: number): string {
  return `$${round(value)}`;
}

/**
 * A neutral label for one listing. Matt's call on 2026-10-09: the price panel
 * shows counts and prices with "via Channel3" and no retailer names, so the
 * shop stays in the url and never reaches the model or any pal text.
 */
function sourceLabel(offer: Channel3Offer): string {
  return offer.condition === "used" ? "Used listing" : "Retail listing, new";
}

/** The cheapest and the dearest of these listings. Both numbers are prices the panel shows. */
function rangeOf(listings: Listing[]): { low: number; high: number } {
  const prices = listings.map((l) => l.offer.price.price).sort((a, b) => a - b);
  return { low: prices[0] ?? 0, high: prices[prices.length - 1] ?? 0 };
}

function byPrice(a: Listing, b: Listing): number {
  return a.offer.price.price - b.offer.price.price;
}

function unknown(note: string): Omit<PriceCheck, "checkedAt"> {
  return { marketLow: 0, marketHigh: 0, currency: "USD", sources: [{ name: note }], provider: "channel3" };
}

export function deriveRange(
  response: Channel3SearchResponse,
  query: { brand: string; model: string; condition: string },
): Omit<PriceCheck, "checkedAt"> {
  const graded = isGradedQuery(query.model);
  const all = relevantListings(response.products, query.model, graded);
  const same = all.filter((l) => l.tier === "same");
  const notes: string[] = [];

  let pool: Listing[];
  if (same.length >= MIN_LISTINGS) pool = same;
  else if (all.length >= MIN_LISTINGS) {
    pool = all;
    const codes = modelCodes(query.model);
    notes.push(
      `Widened to the ${requiredWords(query.model).join(" ")} family because fewer than ${MIN_LISTINGS} listings named the same model${codes.length > 0 ? ` (${codes.join(" ").toUpperCase()})` : ""}`,
    );
  } else return unknown(NO_RELIABLE_PRICE_NOTE);

  // The range is drawn from exactly the listings the panel shows, so keep the pool and the
  // published sources the same set. Cheapest first, and when there are more than the panel
  // holds the dearest go, which leaves the low end of the range where the listings put it.
  pool = [...pool].sort(byPrice);
  if (pool.length > MAX_SOURCES) {
    notes.push(`Showing the ${MAX_SOURCES} cheapest of ${pool.length} priced listings`);
    pool = pool.slice(0, MAX_SOURCES);
  }

  const sources: PriceSource[] = pool.map(({ offer }) => ({
    name: sourceLabel(offer),
    url: offer.url,
    price: offer.price.price,
    condition: offer.condition ?? "new",
  }));

  const usedCard = query.condition !== "new" && !graded;
  const factor = USED_FACTOR[query.condition] ?? 1;
  const newListings = pool.filter((l) => l.offer.condition !== "used");
  const usedListings = pool.filter((l) => l.offer.condition === "used");

  let low: number;
  let high: number;
  if (!usedCard) {
    ({ low, high } = rangeOf(pool));
    if (graded) notes.push("Graded card: compared only with listings of the same grader and grade, no used discount");
  } else if (newListings.length > 0) {
    const scaled = rangeOf(newListings);
    const lowestUsed = usedListings.length > 0 ? Math.min(...usedListings.map((l) => l.offer.price.price)) : Number.POSITIVE_INFINITY;
    low = Math.min(scaled.low * factor, lowestUsed);
    high = scaled.high * factor;
    const grade = `${query.condition.replace("_", " ")}: ${Math.round(factor * 100)}% of new`;
    // The headline is not a listing price here, so say what it was scaled from in the same breath.
    const from = `scaled from ${newListings.length} new listing${newListings.length === 1 ? "" : "s"} priced ${money(scaled.low)} to ${money(scaled.high)}`;
    notes.push(
      lowestUsed < scaled.low * factor
        ? `${ESTIMATE_NOTE_PREFIX} from new retail prices (${grade}), ${from}; a cheaper used offer at ${money(lowestUsed)} set the low end`
        : `${ESTIMATE_NOTE_PREFIX} from new retail prices (${grade}), ${from}`,
    );
  } else {
    ({ low, high } = rangeOf(usedListings));
    notes.push(`${ESTIMATE_NOTE_PREFIX} from used offers only`);
  }

  if (!(low > 0) || round(low) === round(high)) return unknown(NO_RELIABLE_PRICE_NOTE);

  return {
    marketLow: round(low),
    marketHigh: round(high),
    currency: "USD",
    sources: notes.length > 0 ? [{ name: notes.join("; ") }, ...sources] : sources,
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
