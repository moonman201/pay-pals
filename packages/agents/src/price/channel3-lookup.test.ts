import { describe, expect, it } from "vitest";
import { PriceCheckSchema } from "@pay-pals/contracts";
import type { Channel3SearchResponse } from "./channel3-api";
import { createChannel3PriceLookup, deriveRange, relevantProducts } from "./channel3-lookup";
import { createFixturePriceLookup } from "./fixture-lookup";
import type { DiskCache } from "./disk-cache";

const offer = (domain: string, price: number, condition: "new" | "used" | null = "new", availability: "InStock" | "OutOfStock" = "InStock") => ({
  url: `https://${domain}/item`,
  domain,
  price: { price, compare_at_price: null, currency: "USD" },
  availability,
  condition,
});

const response: Channel3SearchResponse = {
  products: [
    { id: "1", title: "Garmin fenix 7 Pro Sapphire Solar 47mm", brands: [{ id: "g", name: "Garmin" }], offers: [offer("shop-a.example", 699.99), offer("shop-b.example", 749.99)] },
    { id: "2", title: "Garmin fenix 7 Pro Sapphire Solar Edition", offers: [offer("shop-c.example", 649.99), offer("shop-d.example", 20, "new", "OutOfStock")] },
    { id: "3", title: "Garmin fenix 7 Pro Sapphire Solar, 47 mm", offers: [offer("shop-e.example", 679)] },
    { id: "4", title: "Garmin Watch Band 22mm", offers: [offer("shop-f.example", 29.99)] },
    { id: "5", title: "Unrelated phone", offers: [offer("shop-g.example", 5)] },
  ],
  next_page_token: null,
};

describe("deriveRange", () => {
  it("keeps matching products, drops out of stock noise and scales for a used card", () => {
    const kept = relevantProducts(response.products, "Garmin", "Fenix 7 Pro Sapphire Solar 47mm");
    expect(kept.map((p) => p.id)).toEqual(["1", "2", "3"]);
    const range = deriveRange(response, { brand: "Garmin", model: "Fenix 7 Pro Sapphire Solar 47mm", condition: "good" });
    expect(range.provider).toBe("channel3");
    expect(range.marketLow).toBeCloseTo(649.99 * 0.7, 1);
    expect(range.marketHigh).toBeCloseTo(749.99 * 0.7, 1);
    expect(range.sources).toHaveLength(4);
    expect(range.sources[0]).toMatchObject({ url: "https://shop-a.example/item", price: 699.99, condition: "new" });
    expect(PriceCheckSchema.safeParse({ ...range, checkedAt: new Date().toISOString() }).success).toBe(true);
  });
  it("does not scale when used offers are present or the card is new", () => {
    const used = { products: [{ id: "u", title: "Garmin fenix 7 Pro used", offers: [offer("x.example", 400, "used")] }], next_page_token: null };
    expect(deriveRange(used, { brand: "Garmin", model: "Fenix 7 Pro", condition: "good" }).marketLow).toBe(400);
    expect(deriveRange(response, { brand: "Garmin", model: "Fenix 7 Pro Sapphire Solar 47mm", condition: "new" }).marketLow).toBe(649.99);
  });
  it("returns an unknown range when nothing comes back", () => {
    expect(deriveRange({ products: [], next_page_token: null }, { brand: "X", model: "Y", condition: "good" })).toMatchObject({ marketLow: 0, marketHigh: 0, sources: [] });
  });
});

describe("createChannel3PriceLookup", () => {
  it("posts the search with the api key and serves repeats from the cache", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const store = new Map<string, unknown>();
    const cache: DiskCache = {
      async get<T>(key: unknown) {
        return (store.get(JSON.stringify(key)) as T) ?? null;
      },
      async set(key, value) {
        store.set(JSON.stringify(key), value);
      },
    };
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } });
    };
    const lookup = createChannel3PriceLookup("test-key", { fetchImpl, cache });
    const first = await lookup.priceRange({ brand: "Garmin", model: "Fenix 7 Pro Sapphire Solar 47mm", condition: "like_new" });
    const second = await lookup.priceRange({ brand: "Garmin", model: "Fenix 7 Pro Sapphire Solar 47mm", condition: "like_new" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.trychannel3.com/v1/search");
    expect((calls[0]!.init!.headers as Record<string, string>)["x-api-key"]).toBe("test-key");
    expect(JSON.parse(calls[0]!.init!.body as string)).toMatchObject({ query: "Garmin Fenix 7 Pro Sapphire Solar 47mm", limit: 20 });
    expect(second.marketLow).toBe(first.marketLow);
  });
  it("throws a readable error on a failed request", async () => {
    const lookup = createChannel3PriceLookup("bad", { fetchImpl: async () => new Response("nope", { status: 401 }), cache: { get: async () => null, set: async () => {} } });
    await expect(lookup.priceRange({ brand: "Garmin", model: "Fenix 7", condition: "good" })).rejects.toThrow(/401/);
  });
});

describe("createFixturePriceLookup", () => {
  it("answers the fixture products and says unknown otherwise", async () => {
    const lookup = createFixturePriceLookup();
    expect((await lookup.priceRange({ brand: "Garmin", model: "Fenix 7 Pro Sapphire Solar 47mm", condition: "good" })).marketLow).toBe(420);
    expect((await lookup.priceRange({ brand: "Garmin", model: "Fenix 7 Pro Solar 47mm", condition: "good" })).marketLow).toBe(400);
    expect((await lookup.priceRange({ brand: "Acme", model: "Thing", condition: "good" })).marketLow).toBe(0);
  });
});
