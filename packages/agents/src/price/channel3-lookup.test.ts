import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { PriceCheckSchema } from "@pay-pals/contracts";
import { Channel3Error, channel3CallCount, type Channel3SearchResponse } from "./channel3-api";
import { ESTIMATE_NOTE_PREFIX, buildSearchRequest, createChannel3PriceLookup, deriveRange, relevantProducts } from "./channel3-lookup";
import { createDiskCache, type DiskCache } from "./disk-cache";
import { createFixturePriceLookup } from "./fixture-lookup";
import { priceBelowMarketRule } from "../rules/price-below-market";
import { card } from "../testing/builders";

const MODEL = "PlayStation 5 disc edition, CFI-1215A";

const offer = (domain: string, price: number, condition: "new" | "used" | null = "new", availability: "InStock" | "OutOfStock" = "InStock") => ({
  url: `https://${domain}/item`,
  domain,
  price: { price, compare_at_price: null, currency: "USD" },
  availability,
  condition,
});

/** Shaped like the documented SearchResponse: offers and brands are optional, condition may be null. */
const response: Channel3SearchResponse = {
  products: [
    { id: "1", title: "Sony PlayStation 5 Console Disc Edition CFI-1215A", brands: [{ id: "s", name: "Sony" }], offers: [offer("shop-a.example", 499.99), offer("shop-b.example", 549.99, null)] },
    { id: "2", title: "Sony PlayStation 5 Disc Edition Slim Console", offers: [offer("shop-c.example", 449.99), offer("shop-d.example", 20, "new", "OutOfStock")] },
    { id: "3", title: "PlayStation 5 Disc Edition, CFI-1215A, Sony", offers: [offer("shop-e.example", 479)] },
    { id: "4", title: "Sony DualSense Wireless Controller", offers: [offer("shop-f.example", 69.99)] },
    { id: "5", title: "Unrelated phone", offers: [offer("shop-g.example", 5)] },
    { id: "6", title: "Sony PlayStation 5 Disc Edition CFI-1215A bundle" },
  ],
  next_page_token: null,
};

const memoryCache = (): DiskCache & { store: Map<string, unknown> } => {
  const store = new Map<string, unknown>();
  return {
    store,
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
    const used = buildSearchRequest({ brand: "Sony", model: "  PlayStation 5   disc edition, CFI-1215A ", condition: "good" }, 20);
    expect(used).toEqual({ query: "sony playstation 5 disc edition, cfi-1215a", limit: 20, filters: { conditions: ["new", "used"] }, config: { country: "US", currency: "USD" } });
    const fresh = buildSearchRequest({ brand: "Sony", model: "PlayStation 5", condition: "new" }, 50);
    expect(fresh.filters).toBeUndefined();
    expect(fresh.limit).toBe(30);
  });
});

/** Shaped like the live PS5 result on 2026-10-07: six new retail offers and GameStop used at the same price as its new one. */
const livePs5: Channel3SearchResponse = {
  products: [
    { id: "a", title: "PlayStation 5 Disc Edition with Two Controllers and Charger", offers: [offer("newegg.com", 839.99)] },
    { id: "b", title: "PlayStation 5 Slim Console Disc Edition", offers: [offer("gamestop.com", 588.99), offer("gamestop.com", 588.99, "used"), offer("gamestop.com", 588.99, "used")] },
    { id: "c", title: "PlayStation 5 Slim Console Disc Edition", offers: [offer("dell.com", 649.99)] },
    { id: "d", title: "PlayStation 5 Slim Console Disc Edition", offers: [offer("cdw.com", 776.99)] },
    { id: "e", title: "PlayStation 5 Slim 1TB Disc Edition Console", offers: [offer("macys.com", 858.99)] },
    { id: "f", title: "PlayStation 5 Disc Edition", offers: [offer("walmart.com", 914.99)] },
  ],
  next_page_token: null,
};

describe("deriveRange", () => {
  it("keeps matching products and drops out of stock noise", () => {
    const kept = relevantProducts(response.products, "Sony", MODEL);
    expect(kept.map((p) => p.id)).toEqual(["1", "2", "3", "6"]);
    const range = deriveRange(response, { brand: "Sony", model: MODEL, condition: "new" });
    expect(range.provider).toBe("channel3");
    expect(range.marketLow).toBe(449.99);
    expect(range.marketHigh).toBe(549.99);
    expect(range.sources).toHaveLength(4);
    expect(range.sources[0]).toMatchObject({ name: "shop-a.example: Sony PlayStation 5 Console Disc Edition CFI-1215A", url: "https://shop-a.example/item", price: 499.99, condition: "new" });
    expect(range.sources[1]!.condition).toBe("new");
    expect(PriceCheckSchema.safeParse({ ...range, checkedAt: new Date().toISOString() }).success).toBe(true);
  });

  it("scales new retail for a used card even when used offers are priced like new, and records the path", () => {
    const range = deriveRange(livePs5, { brand: "Sony", model: "PlayStation 5 disc edition CFI-1215A", condition: "good" });
    // New offers sorted: 588.99, 649.99, 776.99, 839.99, 858.99, 914.99. p20 -> 649.99, p80 -> 858.99, times 0.7.
    expect(range.marketLow).toBeCloseTo(649.99 * 0.7, 2);
    expect(range.marketHigh).toBeCloseTo(858.99 * 0.7, 2);
    expect(range.sources[0]!.name).toBe(`${ESTIMATE_NOTE_PREFIX} from new retail prices (good: 70% of new)`);
    expect(range.sources[0]!.url).toBeUndefined();
    expect(PriceCheckSchema.safeParse({ ...range, checkedAt: new Date().toISOString() }).success).toBe(true);

    const priceCheck = { ...range, checkedAt: new Date().toISOString() };
    const clean = priceBelowMarketRule({ card: card({ askingPrice: 420 }), chat: [], priceCheck });
    expect(clean).toHaveLength(0);
    const emptyBoxAsk = priceBelowMarketRule({ card: card({ askingPrice: 410 }), chat: [], priceCheck });
    expect(emptyBoxAsk).toHaveLength(0);
    const scam = priceBelowMarketRule({ card: card({ askingPrice: 220 }), chat: [], priceCheck });
    expect(scam[0]).toMatchObject({ code: "PRICE_FAR_BELOW_MARKET", severity: "stop" });
  });

  it("lets a genuinely cheaper used offer pull the low end down, never up", () => {
    const cheaperUsed: Channel3SearchResponse = {
      products: [{ id: "u", title: "Sony PlayStation 5 disc edition", offers: [offer("retail.example", 500), offer("retail.example", 540), offer("resale.example", 300, "used")] }],
      next_page_token: null,
    };
    const range = deriveRange(cheaperUsed, { brand: "Sony", model: "PlayStation 5 disc edition", condition: "good" });
    expect(range.marketLow).toBe(300);
    expect(range.marketHigh).toBeCloseTo(540 * 0.7, 2);
    expect(range.sources[0]!.name).toContain("a cheaper used offer at $300 set the low end");

    const pricierUsed: Channel3SearchResponse = {
      products: [{ id: "u", title: "Sony PlayStation 5 disc edition", offers: [offer("retail.example", 500), offer("resale.example", 450, "used")] }],
      next_page_token: null,
    };
    expect(deriveRange(pricierUsed, { brand: "Sony", model: "PlayStation 5 disc edition", condition: "good" }).marketLow).toBe(350);
  });

  it("uses used offers as they are when no new offers came back", () => {
    const usedOnly: Channel3SearchResponse = {
      products: [{ id: "u", title: "Sony PlayStation 5 disc edition used", offers: [offer("x.example", 380, "used"), offer("y.example", 420, "used")] }],
      next_page_token: null,
    };
    const range = deriveRange(usedOnly, { brand: "Sony", model: "PlayStation 5 disc edition", condition: "good" });
    expect(range.marketLow).toBe(380);
    expect(range.marketHigh).toBe(420);
    expect(range.sources[0]!.name).toBe(`${ESTIMATE_NOTE_PREFIX} from used offers only`);
  });

  it("returns an unknown range when nothing comes back", () => {
    expect(deriveRange({ products: [], next_page_token: null }, { brand: "X", model: "Y", condition: "good" })).toMatchObject({ marketLow: 0, marketHigh: 0, sources: [] });
  });
});

describe("createChannel3PriceLookup", () => {
  it("posts the search with the api key, makes one live call per lookup and none when the cache answers", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const cache = memoryCache();
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } });
    };
    const before = channel3CallCount();
    const lookup = createChannel3PriceLookup("test-key", { fetchImpl, cache });
    const first = await lookup.priceRange({ brand: "Sony", model: MODEL, condition: "like_new" });
    const second = await lookup.priceRange({ brand: "sony", model: MODEL.toLowerCase(), condition: "good" });
    expect(calls).toHaveLength(1);
    expect(channel3CallCount() - before).toBe(1);
    expect(calls[0]!.url).toBe("https://api.trychannel3.com/v1/search");
    expect((calls[0]!.init!.headers as Record<string, string>)["x-api-key"]).toBe("test-key");
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({
      query: "sony playstation 5 disc edition, cfi-1215a",
      limit: 20,
      filters: { conditions: ["new", "used"] },
      config: { country: "US", currency: "USD" },
    });
    // Same cached response; only the estimate note differs because the second card is a different grade.
    expect(second.sources.slice(1)).toEqual(first.sources.slice(1));
    expect(first.sources[0]!.name).toContain("like new: 80% of new");
    expect(second.sources[0]!.name).toContain("good: 70% of new");
  });
  it("throws a Channel3Error carrying the status on a failed request", async () => {
    const lookup = createChannel3PriceLookup("bad", { fetchImpl: async () => new Response('{"detail":"invalid key"}', { status: 401 }), cache: memoryCache() });
    const error = await lookup.priceRange({ brand: "Sony", model: "PlayStation 5", condition: "good" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Channel3Error);
    expect((error as Channel3Error).status).toBe(401);
    expect((error as Error).message).toContain("401");
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
    expect(await cache.get({ query: "something else", limit: 20 })).toBeNull();
  });
});

describe("createFixturePriceLookup", () => {
  it("answers the fixture product and says unknown otherwise", async () => {
    const lookup = createFixturePriceLookup();
    expect((await lookup.priceRange({ brand: "Sony", model: MODEL, condition: "good" })).marketLow).toBe(380);
    expect((await lookup.priceRange({ brand: "Sony", model: "PS5 disc edition", condition: "like_new" })).marketHigh).toBe(499);
    expect((await lookup.priceRange({ brand: "Acme", model: "Thing", condition: "good" })).marketLow).toBe(0);
  });
});
