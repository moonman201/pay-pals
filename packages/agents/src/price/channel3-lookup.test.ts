import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { PriceCheckSchema } from "@pay-pals/contracts";
import { Channel3Error, channel3CallCount, type Channel3SearchResponse } from "./channel3-api";
import {
  ESTIMATE_NOTE_PREFIX,
  MAX_SOURCES,
  NO_RELIABLE_PRICE_NOTE,
  buildSearchRequest,
  classifyTitle,
  createChannel3PriceLookup,
  deriveRange,
  isGradedQuery,
  modelCodes,
  requiredWords,
} from "./channel3-lookup";
import { createDiskCache, type DiskCache } from "../cache/disk-cache";
import { createFixturePriceLookup } from "./fixture-lookup";
import { listingCounts } from "../buyer/review";
import { priceBelowMarketRule } from "../rules/price-below-market";
import { card } from "../testing/builders";

const PS5 = "PlayStation 5 disc edition, CFI-1015A";
const SLAB = "Sun & Moon Tag Bolt, Gengar & Mimikyu GX, 038/095, PSA 10";

const offer = (domain: string, price: number, condition: "new" | "used" | null = "new", availability: "InStock" | "OutOfStock" = "InStock") => ({
  url: `https://${domain}/item`,
  domain,
  price: { price, compare_at_price: null, currency: "USD" },
  availability,
  condition,
});
const product = (id: string, title: string, offers: ReturnType<typeof offer>[]) => ({ id, title, offers });
const at = (range: ReturnType<typeof deriveRange>) => ({ ...range, checkedAt: new Date().toISOString() });

/** Shaped like the live PS5 result on 2026-10-07, plus a bundle and repeated listings. */
const livePs5: Channel3SearchResponse = {
  products: [
    product("a", "PlayStation 5 Disc Edition with Two Controllers and Charger", [offer("newegg.com", 839.99)]),
    product("b", "PlayStation 5 Slim Console Disc Edition", [offer("gamestop.com", 588.99), offer("gamestop.com", 588.99, "used"), offer("gamestop.com", 588.99, "used")]),
    product("c", "PlayStation 5 Slim Console Disc Edition", [offer("dell.com", 649.99)]),
    product("d", "PlayStation 5 Slim Console Disc Edition", [offer("cdw.com", 776.99)]),
    product("e", "PlayStation 5 Slim 1TB Disc Edition Console", [offer("macys.com", 858.99)]),
    product("f", "PlayStation 5 Disc Edition", [offer("walmart.com", 914.99)]),
    product("g", "PlayStation 5 Disc Edition Console + Spider-Man 2", [offer("target.com", 499.99)]),
    product("h", "PlayStation 5 DualSense Wireless Controller", [offer("bestbuy.com", 69.99)]),
    product("i", "PlayStation 5 Digital Edition Console", [offer("bestbuy.com", 449.99)]),
  ],
  next_page_token: null,
};

const memoryCache = (): DiskCache => {
  const store = new Map<string, unknown>();
  return {
    async get<T>(key: unknown) {
      return (store.get(JSON.stringify(key)) as T) ?? null;
    },
    async set(key, value) {
      store.set(JSON.stringify(key), value);
    },
  };
};

describe("buildSearchRequest", () => {
  it("normalizes the query and asks for used offers only when the card is used", () => {
    const used = buildSearchRequest({ brand: "Sony", model: "  PlayStation 5   disc edition, CFI-1015A ", condition: "good" }, 20);
    expect(used).toEqual({ query: "sony playstation 5 disc edition, cfi-1015a", limit: 20, filters: { conditions: ["new", "used"] }, config: { country: "US", currency: "USD" } });
    const fresh = buildSearchRequest({ brand: "Sony", model: "PlayStation 5", condition: "new" }, 50);
    expect(fresh.filters).toBeUndefined();
    expect(fresh.limit).toBe(30);
  });
});

describe("classifyTitle", () => {
  it("knows the model code, the required words and graded queries", () => {
    expect(modelCodes(PS5)).toEqual(["cfi1015a"]);
    expect(requiredWords(PS5)).toEqual(["playstation", "disc"]);
    expect(requiredWords(SLAB)).toEqual(["sun", "moon", "tag", "bolt", "gengar", "mimikyu"]);
    expect(isGradedQuery(SLAB)).toBe(true);
    expect(isGradedQuery(PS5)).toBe(false);
  });
  it("sorts PS5 titles into same model, family and dropped", () => {
    expect(classifyTitle("Sony PlayStation 5 Console Disc Edition CFI-1015A", PS5, false)).toBe("same");
    expect(classifyTitle("PlayStation 5 Disc Edition", PS5, false)).toBe("same");
    expect(classifyTitle("PlayStation 5 Slim Console Disc Edition", PS5, false)).toBe("family");
    expect(classifyTitle("PlayStation 5 Pro Disc Edition", PS5, false)).toBe("family");
    expect(classifyTitle("PlayStation 5 Digital Edition Console", PS5, false)).toBeNull();
    expect(classifyTitle("PlayStation 5 Disc Edition with Two Controllers and Charger", PS5, false)).toBeNull();
    expect(classifyTitle("PlayStation 5 Disc Edition Console + Spider-Man 2", PS5, false)).toBeNull();
    expect(classifyTitle("PlayStation 5 DualSense Wireless Controller", PS5, false)).toBeNull();
    expect(classifyTitle("PS5 Disc Edition Bundle", PS5, false)).toBeNull();
  });
  it("keeps only the same character, set, grader and grade for a graded card", () => {
    expect(classifyTitle("2018 Pokemon Japanese Sun & Moon Tag Bolt Gengar & Mimikyu GX #038 PSA 10", SLAB, true)).toBe("same");
    expect(classifyTitle("Jolteon Master Ball Reverse Holo PSA 10", SLAB, true)).toBeNull();
    expect(classifyTitle("2018 Pokemon Japanese Sun & Moon Tag Bolt Gengar & Mimikyu GX PSA 9", SLAB, true)).toBeNull();
    expect(classifyTitle("2018 Pokemon Japanese Sun & Moon Tag Bolt Pikachu & Zekrom GX PSA 10", SLAB, true)).toBeNull();
    expect(classifyTitle("2018 Pokemon Japanese Sun & Moon Tag Bolt Gengar & Mimikyu GX Ungraded", SLAB, true)).toBeNull();
    expect(classifyTitle("PSA Card Slab Protector Case", SLAB, true)).toBeNull();
    expect(classifyTitle("Sun & Moon Tag Bolt Gengar & Mimikyu GX PSA 10 Lot of 2", SLAB, true)).toBeNull();
  });
});

describe("deriveRange on PS5 comps", () => {
  it("dedupes, drops bundles and accessories, widens to the Slim family with a note, and scales for a used card", () => {
    const range = deriveRange(livePs5, { brand: "Sony", model: PS5, condition: "good" });
    // Kept: walmart 914.99 (same); gamestop new 588.99, gamestop used 588.99 (one), dell 649.99, cdw 776.99, macys 858.99 (family).
    // New listings sorted: 588.99, 649.99, 776.99, 858.99, 914.99 -> cheapest and dearest, times 0.7.
    expect(range.marketLow).toBeCloseTo(588.99 * 0.7, 2);
    expect(range.marketHigh).toBeCloseTo(914.99 * 0.7, 2);
    expect(range.sources[0]!.name).toContain("Widened to the playstation disc family because fewer than 3 listings named the same model (CFI1015A)");
    expect(range.sources[0]!.name).toContain(`${ESTIMATE_NOTE_PREFIX} from new retail prices (good: 70% of new)`);
    const priced = range.sources.filter((s) => s.price !== undefined);
    expect(priced).toHaveLength(6);
    // The accessory and the bundle are out of the pool; the retailer lives in the url, not the label.
    expect(priced.map((s) => s.price)).not.toContain(69.99);
    expect(priced.map((s) => s.name).sort()).toEqual(["Retail listing, new", "Retail listing, new", "Retail listing, new", "Retail listing, new", "Retail listing, new", "Used listing"]);
    expect(priced.filter((s) => s.url?.includes("gamestop.com") && s.condition === "used")).toHaveLength(1);
    expect(PriceCheckSchema.safeParse(at(range)).success).toBe(true);
    expect(priceBelowMarketRule({ card: card({ askingPrice: 420 }), chat: [], priceCheck: at(range) })).toHaveLength(0);
    expect(priceBelowMarketRule({ card: card({ askingPrice: 220 }), chat: [], priceCheck: at(range) })[0]!.severity).toBe("stop");
  });
  it("uses only same-model listings when there are three or more", () => {
    const sameModel: Channel3SearchResponse = {
      products: [
        product("1", "Sony PlayStation 5 Console Disc Edition CFI-1015A", [offer("a.example", 499.99)]),
        product("2", "PlayStation 5 Disc Edition CFI-1015A", [offer("b.example", 519.99)]),
        product("3", "PlayStation 5 Disc Edition", [offer("c.example", 549.99)]),
        product("4", "PlayStation 5 Slim Console Disc Edition", [offer("d.example", 99)]),
      ],
      next_page_token: null,
    };
    const range = deriveRange(sameModel, { brand: "Sony", model: PS5, condition: "new" });
    expect(range.marketLow).toBe(499.99);
    expect(range.marketHigh).toBe(549.99);
    expect(range.sources).toHaveLength(3);
    expect(range.sources.some((s) => s.name.includes("Widened"))).toBe(false);
  });
  it("lets a genuinely cheaper used offer pull the low end down, never up", () => {
    const base = [product("1", "PlayStation 5 Disc Edition", [offer("a.example", 500), offer("b.example", 540), offer("c.example", 560)])];
    const cheaper = deriveRange({ products: [...base, product("u", "PlayStation 5 Disc Edition", [offer("resale.example", 300, "used")])], next_page_token: null }, { brand: "Sony", model: "PlayStation 5 disc edition", condition: "good" });
    expect(cheaper.marketLow).toBe(300);
    expect(cheaper.marketHigh).toBeCloseTo(560 * 0.7, 2);
    expect(cheaper.sources[0]!.name).toContain("a cheaper used offer at $300 set the low end");
    const pricier = deriveRange({ products: [...base, product("u", "PlayStation 5 Disc Edition", [offer("resale.example", 450, "used")])], next_page_token: null }, { brand: "Sony", model: "PlayStation 5 disc edition", condition: "good" });
    expect(pricier.marketLow).toBe(350);
  });
  it("uses used offers as they are when no new offers came back", () => {
    const usedOnly: Channel3SearchResponse = {
      products: [product("u", "PlayStation 5 Disc Edition", [offer("x.example", 380, "used"), offer("y.example", 420, "used"), offer("z.example", 440, "used")])],
      next_page_token: null,
    };
    const range = deriveRange(usedOnly, { brand: "Sony", model: "PlayStation 5 disc edition", condition: "good" });
    expect(range).toMatchObject({ marketLow: 380, marketHigh: 440 });
    expect(range.sources[0]!.name).toBe(`${ESTIMATE_NOTE_PREFIX} from used offers only`);
  });
});

/**
 * Shaped like the live production result that put a headline on the panel no
 * listing underneath it supported: mostly new stock, one used offer, and one
 * entry Channel3 returned with no price at all.
 */
const liveProduction: Channel3SearchResponse = {
  products: [
    product("1", "PlayStation 5 Disc Edition", [offer("a.example", 588.99)]),
    product("2", "PlayStation 5 Console Disc Edition", [offer("b.example", 629.99)]),
    product("3", "PlayStation 5 Disc Edition", [offer("c.example", 649.99)]),
    product("4", "PlayStation 5 Disc Edition Console", [offer("d.example", 776.99)]),
    product("5", "PlayStation 5 Disc Edition", [offer("e.example", 799.99)]),
    product("6", "PlayStation 5 Console Disc Edition", [offer("f.example", 858.99)]),
    product("7", "PlayStation 5 Disc Edition", [offer("g.example", 914.99)]),
    product("8", "PlayStation 5 Disc Edition", [offer("h.example", 449.99, "used")]),
    product("9", "PlayStation 5 Disc Edition", [offer("i.example", 0)]),
  ],
  next_page_token: null,
};

describe("deriveRange keeps the headline checkable against the listings", () => {
  const range = deriveRange(liveProduction, { brand: "Sony", model: PS5, condition: "good" });
  const priced = range.sources.filter((s) => s.price !== undefined);
  const prices = priced.map((s) => s.price!);
  const newPrices = priced.filter((s) => s.condition !== "used").map((s) => s.price!);

  it("counts only the listings that carry a price", () => {
    // Nine entries came back, one with no price. That one is not a listing.
    expect(liveProduction.products).toHaveLength(9);
    expect(priced).toHaveLength(8);
    expect(prices).not.toContain(0);
    expect(listingCounts(at(range))).toBe("from 8 listings (7 new, 1 used)");
    // The only entry without a price is the note that says how the range was reached.
    expect(range.sources.filter((s) => s.price === undefined)).toEqual([{ name: range.sources[0]!.name }]);
    expect(range.sources).toHaveLength(9);
  });

  it("draws the range from the listings it publishes, and says what it scaled from", () => {
    // Cheapest first, so a reader can check the ends of the range against the ends of the list.
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(Math.min(...newPrices)).toBe(588.99);
    expect(Math.max(...newPrices)).toBe(914.99);
    expect(range.marketLow).toBeCloseTo(588.99 * 0.7, 2);
    expect(range.marketHigh).toBeCloseTo(914.99 * 0.7, 2);
    expect(range.sources[0]!.name).toBe(`${ESTIMATE_NOTE_PREFIX} from new retail prices (good: 70% of new), scaled from 7 new listings priced $588.99 to $914.99`);
    expect(PriceCheckSchema.safeParse(at(range)).success).toBe(true);
  });

  it("leaves a fair asking price alone", () => {
    // $420 for a used console sits inside $412.29 to $640.49, so the clean deal gets no warning.
    expect(range.marketLow).toBeLessThan(420);
    expect(range.marketHigh).toBeGreaterThan(420);
    expect(priceBelowMarketRule({ card: card({ askingPrice: 420 }), chat: [], priceCheck: at(range) })).toHaveLength(0);
    expect(priceBelowMarketRule({ card: card({ askingPrice: 150 }), chat: [], priceCheck: at(range) })[0]!.severity).toBe("stop");
  });

  it("publishes every listing the range came from, and says so when it cannot", () => {
    const many: Channel3SearchResponse = {
      products: Array.from({ length: MAX_SOURCES + 3 }, (_, i) => product(`m${i}`, "PlayStation 5 Disc Edition", [offer(`m${i}.example`, 500 + i * 10)])),
      next_page_token: null,
    };
    const capped = deriveRange(many, { brand: "Sony", model: PS5, condition: "new" });
    const keptPrices = capped.sources.filter((s) => s.price !== undefined).map((s) => s.price!);
    expect(keptPrices).toHaveLength(MAX_SOURCES);
    expect(capped.marketLow).toBe(Math.min(...keptPrices));
    expect(capped.marketHigh).toBe(Math.max(...keptPrices));
    expect(capped.sources[0]!.name).toBe(`Showing the ${MAX_SOURCES} cheapest of ${MAX_SOURCES + 3} priced listings`);
  });
});

describe("deriveRange refuses thin or flat data", () => {
  it("returns the unknown range with the note when fewer than three relevant listings remain", () => {
    const two: Channel3SearchResponse = { products: [product("1", "PlayStation 5 Disc Edition", [offer("a.example", 500), offer("b.example", 540)])], next_page_token: null };
    expect(deriveRange(two, { brand: "Sony", model: PS5, condition: "new" })).toMatchObject({ marketLow: 0, marketHigh: 0, sources: [{ name: NO_RELIABLE_PRICE_NOTE }] });
    expect(deriveRange({ products: [], next_page_token: null }, { brand: "X", model: "Y", condition: "good" })).toMatchObject({ marketLow: 0, marketHigh: 0 });
  });
  it("never builds a range from one listing or one whose low equals its high", () => {
    const one: Channel3SearchResponse = { products: [product("1", "Jolteon Master Ball Reverse Holo PSA 10", [offer("gamestop.com", 131.99)])], next_page_token: null };
    expect(deriveRange(one, { brand: "Pokemon", model: "Jolteon Master Ball Reverse Holo PSA 10", condition: "like_new" }).marketLow).toBe(0);
    const flat: Channel3SearchResponse = { products: [product("1", "PlayStation 5 Disc Edition", [offer("a.example", 500), offer("b.example", 500), offer("c.example", 500)])], next_page_token: null };
    const range = deriveRange(flat, { brand: "Sony", model: PS5, condition: "new" });
    expect(range.marketLow).toBe(0);
    expect(range.sources[0]!.name).toBe(NO_RELIABLE_PRICE_NOTE);
  });
});

describe("deriveRange on a graded card", () => {
  const noise = [
    product("j", "Jolteon Master Ball Reverse Holo PSA 10", [offer("gamestop.com", 131.99)]),
    product("p", "Pokemon Gengar Plush - 12 inch Soft Plush", [offer("walmart.com", 24.97)]),
    product("t", "Pokemon Card Eng. Gengar VMAX Tin", [offer("kickscrew.com", 97.11)]),
    product("c", "PSA Card Slab Protector Case", [offer("walmart.com", 12)]),
  ];
  it("returns the unknown range when no listing is the same graded card, so the Jolteon never sets a price", () => {
    const range = deriveRange({ products: noise, next_page_token: null }, { brand: "Pokemon", model: SLAB, condition: "like_new" });
    expect(range).toMatchObject({ marketLow: 0, marketHigh: 0, sources: [{ name: NO_RELIABLE_PRICE_NOTE }] });
    expect(priceBelowMarketRule({ card: card({ askingPrice: 140 }), chat: [], priceCheck: at(range) })).toHaveLength(0);
  });
  it("prices a graded card from same grader and grade listings with no used discount", () => {
    const comps: Channel3SearchResponse = {
      products: [
        ...noise,
        product("1", "2018 Pokemon Japanese Sun & Moon Tag Bolt Gengar & Mimikyu GX #038 PSA 10", [offer("cards.example", 480, "used")]),
        product("2", "2018 Pokemon Japanese Sun & Moon Tag Bolt Gengar & Mimikyu GX PSA 10 Gem Mint", [offer("auction.example", 310, "used")]),
        product("3", "Pokemon Sun & Moon Tag Bolt Gengar & Mimikyu GX PSA 10", [offer("shop.example", 505, "used")]),
      ],
      next_page_token: null,
    };
    const range = deriveRange(comps, { brand: "Pokemon", model: SLAB, condition: "like_new" });
    expect(range.marketLow).toBe(310);
    expect(range.marketHigh).toBe(505);
    expect(range.sources[0]!.name).toContain("Graded card: compared only with listings of the same grader and grade, no used discount");
    expect(priceBelowMarketRule({ card: card({ askingPrice: 140 }), chat: [], priceCheck: at(range) })[0]!.severity).toBe("stop");
  });
});

describe("createChannel3PriceLookup", () => {
  it("posts the search with the api key, makes one live call per lookup and none when the cache answers", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const cache = memoryCache();
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(livePs5), { status: 200, headers: { "content-type": "application/json" } });
    };
    const before = channel3CallCount();
    const lookup = createChannel3PriceLookup("test-key", { fetchImpl, cache });
    const first = await lookup.priceRange({ brand: "Sony", model: PS5, condition: "like_new" });
    const second = await lookup.priceRange({ brand: "sony", model: PS5.toLowerCase(), condition: "good" });
    expect(calls).toHaveLength(1);
    expect(channel3CallCount() - before).toBe(1);
    expect(calls[0]!.url).toBe("https://api.trychannel3.com/v1/search");
    expect((calls[0]!.init!.headers as Record<string, string>)["x-api-key"]).toBe("test-key");
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({
      query: "sony playstation 5 disc edition, cfi-1015a",
      limit: 20,
      filters: { conditions: ["new", "used"] },
      config: { country: "US", currency: "USD" },
    });
    expect(second.sources.slice(1)).toEqual(first.sources.slice(1));
    expect(first.sources[0]!.name).toContain("like new: 80% of new");
    expect(second.sources[0]!.name).toContain("good: 70% of new");
  });
  it("throws a Channel3Error carrying the status on a failed request", async () => {
    const lookup = createChannel3PriceLookup("bad", { fetchImpl: async () => new Response('{"detail":"invalid key"}', { status: 401 }), cache: memoryCache() });
    const error = await lookup.priceRange({ brand: "Sony", model: "PlayStation 5", condition: "good" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Channel3Error);
    expect((error as Channel3Error).status).toBe(401);
  });
});

describe("createDiskCache", () => {
  const dir = mkdtempSync(join(tmpdir(), "pay-pals-channel3-cache-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("serves an entry inside its time to live and expires it after a day", async () => {
    let clock = 1_000_000;
    const cache = createDiskCache({ dir, now: () => clock });
    const key = { query: "sony playstation 5", limit: 20 };
    await cache.set(key, { products: [] });
    expect(await cache.get(key)).toEqual({ products: [] });
    clock += 23 * 60 * 60 * 1000;
    expect(await cache.get(key)).toEqual({ products: [] });
    clock += 2 * 60 * 60 * 1000;
    expect(await cache.get(key)).toBeNull();
  });
});

describe("createFixturePriceLookup", () => {
  it("answers the fixture products and says unknown otherwise", async () => {
    const lookup = createFixturePriceLookup();
    expect((await lookup.priceRange({ brand: "Sony", model: PS5, condition: "good" })).marketLow).toBe(380);
    expect((await lookup.priceRange({ brand: "Pokemon", model: SLAB, condition: "like_new" })).marketLow).toBe(305);
    expect((await lookup.priceRange({ brand: "Acme", model: "Thing", condition: "good" })).marketLow).toBe(0);
  });
});
