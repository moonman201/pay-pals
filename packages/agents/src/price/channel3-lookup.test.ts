import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { PriceCheckSchema } from "@pay-pals/contracts";
import { Channel3Error, channel3CallCount, type Channel3SearchResponse } from "./channel3-api";
import { buildSearchRequest, createChannel3PriceLookup, deriveRange, relevantProducts } from "./channel3-lookup";
import { createDiskCache, type DiskCache } from "./disk-cache";
import { createFixturePriceLookup } from "./fixture-lookup";

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

describe("deriveRange", () => {
  it("keeps matching products, drops out of stock noise and scales for a used card", () => {
    const kept = relevantProducts(response.products, "Sony", MODEL);
    expect(kept.map((p) => p.id)).toEqual(["1", "2", "3", "6"]);
    const range = deriveRange(response, { brand: "Sony", model: MODEL, condition: "good" });
    expect(range.provider).toBe("channel3");
    expect(range.marketLow).toBeCloseTo(449.99 * 0.7, 1);
    expect(range.marketHigh).toBeCloseTo(549.99 * 0.7, 1);
    expect(range.sources).toHaveLength(4);
    expect(range.sources[0]).toMatchObject({ name: "shop-a.example: Sony PlayStation 5 Console Disc Edition CFI-1215A", url: "https://shop-a.example/item", price: 499.99, condition: "new" });
    expect(range.sources[1]!.condition).toBe("new");
    expect(PriceCheckSchema.safeParse({ ...range, checkedAt: new Date().toISOString() }).success).toBe(true);
  });
  it("does not scale when used offers are present or the card is new", () => {
    const used = { products: [{ id: "u", title: "Sony PlayStation 5 disc edition used", offers: [offer("x.example", 380, "used")] }], next_page_token: null };
    expect(deriveRange(used, { brand: "Sony", model: "PlayStation 5 disc edition", condition: "good" }).marketLow).toBe(380);
    expect(deriveRange(response, { brand: "Sony", model: MODEL, condition: "new" }).marketLow).toBe(449.99);
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
    expect(second.sources).toEqual(first.sources);
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
