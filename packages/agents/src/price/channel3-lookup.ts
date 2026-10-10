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
 * Two more filters, added on 2026-10-10 after the live panel put a $100 low
 * on a PS5 (REVIEW finding of 2026-10-09). The widened family search had
 * pulled a part priced at a fraction of a console into the console listings.
 * The rule is now "the same item only", enforced two ways:
 *   - a listing that names our item after "for", "fits", "compatible with"
 *     or "designed for" is something made for the item, not the item, so it
 *     is dropped. This catches a part or an add-on whose title still carries
 *     every required word ("Disc Drive for PlayStation 5");
 *   - a listing priced under OUTLIER_FLOOR of the pool's median is too cheap
 *     to be the same item and is dropped before the range is built, with the
 *     count, the median and the dropped price in the note. This is the
 *     backstop for a part whose title reads like the item itself. A listing
 *     anywhere near the rest of the pool is never dropped, so a genuinely
 *     cheap used offer still pulls the low end down.
 * A keyword list of part names was considered and rejected: "disc drive"
 * also appears in console titles that advertise the drive, so the list would
 * drop real comps, and it would need a new word every time a merchant
 * invents one. The two rules above need no upkeep.
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
 *
 * One range per item per run. The derivation depends on nothing but brand,
 * model and condition, so the same item always derives the same range from
 * the same search response. Channel3 does not answer the same query the same
 * way every time, though, and the two PS5 scenarios describe one console, so
 * a run that looked it up twice used to quote two ranges for it. A short
 * in-process memo in front of the cache fixes that: one search answers every
 * lookup of the same item in the same process for SAME_RUN_TTL_MS. It is on
 * in production, where there is no disk cache, and off everywhere else,
 * where the disk cache already serves two lookups from one search. It also
 * saves a credit.
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
  /**
   * How long one search answers every lookup of the same item in this
   * process. Defaults to SAME_RUN_TTL_MS in production, where there is no
   * disk cache, and to 0 everywhere else, where the disk cache already
   * answers twice from one search and a test wants the fetch it set up.
   */
  sameRunTtlMs?: number;
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
/** A listing priced under this share of the pool's median is not the same item. 0.4 leaves room for a genuinely cheap used offer. */
export const OUTLIER_FLOOR = 0.4;
/** How long one search answers every lookup of the same item in the same process. */
export const SAME_RUN_TTL_MS = 10 * 60 * 1000;

const GRADER = /\b(psa|bgs|cgc|sgc)\s*-?\s*(10|[1-9](?:\.5)?)\b/i;
const BUNDLE = /\bbundles?\b|\+|\bwith\s+(?:2|two|3|three|\d+)\s+controllers?\b|\band\s+games?\b|\bgames?\s+(?:bundle|included)\b|\blots?\s+of\b|\bset\s+of\s+\d|\bpack\s+of\s+\d|\bmystery\b/i;
const ACCESSORY =
  /\b(?:controllers?|chargers?|charging|stands?|covers?|skins?|cases?|protectors?|sleeves?|binders?|portfolios?|deck\s*box(?:es)?|plush|plushies?|figures?|t-?shirts?|hoodies?|tins?|boosters?|posters?|stickers?|cables?|headsets?|mounts?|docks?|nanoblocks?|keychains?|toppers?|wall\s+art)\b/i;
/** A title that names our item only as the thing it is made for: "Disc Drive for PlayStation 5", "Cover compatible with ...". */
const MADE_FOR = /\b(?:for|fits|compatible\s+with|designed\s+for|replacement\s+for|suitable\s+for)\b/i;
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

/**
 * True when the listing names our item as the thing it is made for rather
 * than the thing it is: a required word first appears after a "for", "fits"
 * or "compatible with". "Disc Drive for PlayStation 5" is out; "PlayStation
 * 5 Disc Edition Console for gaming" is in, because both required words are
 * already there before the "for".
 */
export function madeForTheItem(normalizedTitle: string, required: readonly string[]): boolean {
  const madeFor = normalizedTitle.match(MADE_FOR);
  if (!madeFor || madeFor.index === undefined) return false;
  return required.some((word) => normalizedTitle.indexOf(word) > madeFor.index!);
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
  const required = requiredWords(model);
  for (const word of required) if (!words.has(word)) return null;
  if (madeForTheItem(t, required)) return null;

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

/** The middle price of these listings, or the mean of the middle two when there is an even number. */
export function medianPrice(listings: readonly Listing[]): number {
  const prices = listings.map((l) => l.offer.price.price).sort((a, b) => a - b);
  if (prices.length === 0) return 0;
  const middle = Math.floor(prices.length / 2);
  return prices.length % 2 === 1 ? prices[middle]! : (prices[middle - 1]! + prices[middle]!) / 2;
}

/**
 * Drops the listings that are too cheap to be the same item: under
 * OUTLIER_FLOOR of the pool's median. A part or an add-on that slipped past
 * the title filters sits far below the pack; a cheap used offer does not.
 */
function dropPriceOutliers(pool: readonly Listing[]): { kept: Listing[]; dropped: Listing[]; median: number } {
  const median = medianPrice(pool);
  const floor = median * OUTLIER_FLOOR;
  const kept: Listing[] = [];
  const dropped: Listing[] = [];
  for (const listing of pool) (listing.offer.price.price < floor ? dropped : kept).push(listing);
  return { kept, dropped, median };
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

  // The same item only: anything priced far under the rest of the pool is a part or an
  // add-on, not this item, and it would otherwise set the low end of the headline range.
  const outliers = dropPriceOutliers(pool);
  if (outliers.dropped.length > 0) {
    if (outliers.kept.length < MIN_LISTINGS) return unknown(NO_RELIABLE_PRICE_NOTE);
    const prices = [...outliers.dropped]
      .sort(byPrice)
      .map((l) => money(l.offer.price.price))
      .join(", ");
    notes.push(
      `Dropped ${outliers.dropped.length} listing${outliers.dropped.length === 1 ? "" : "s"} priced under ${Math.round(OUTLIER_FLOOR * 100)}% of the ${money(outliers.median)} median (${prices}), too cheap to be the same item`,
    );
    pool = outliers.kept;
  }

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

/**
 * One search answers every lookup of the same item in this process for
 * SAME_RUN_TTL_MS, so one item never gets two different ranges in one run.
 * Module level on purpose: apps/web builds a lookup per request.
 */
const sameRun = new Map<string, { at: number; response: Channel3SearchResponse }>();

/** Forgets the in-process responses. For tests that want a fresh run. */
export function clearSameRunResponses(): void {
  sameRun.clear();
}

export function createChannel3PriceLookup(apiKey: string, options: Channel3Options = {}): MarketPriceLookup {
  const cache = options.cache ?? (process.env.NODE_ENV === "production" ? noCache : createDiskCache());
  const limit = options.limit ?? 20;
  const ttl = options.sameRunTtlMs ?? (process.env.NODE_ENV === "production" ? SAME_RUN_TTL_MS : 0);
  return {
    async priceRange(query): Promise<PriceCheck> {
      const request = buildSearchRequest(query, limit);
      const key = JSON.stringify(request);
      const remembered = ttl > 0 ? sameRun.get(key) : undefined;
      let response = remembered && Date.now() - remembered.at < ttl ? remembered.response : null;
      if (!response) response = await cache.get<Channel3SearchResponse>(request);
      if (!response) {
        response = await channel3Search(apiKey, request, options.fetchImpl);
        await cache.set(request, response);
      }
      if (ttl > 0) sameRun.set(key, { at: Date.now(), response });
      return { ...deriveRange(response, query), checkedAt: new Date().toISOString() };
    },
  };
}
