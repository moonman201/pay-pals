/**
 * Live site review, Oct 7, PLAN item 14: a market range is never a single
 * number and never built from one listing. Checked through the Buyer Pal's
 * verdict on every fixture (fixture prices) and through the Channel3 lookup
 * over a fake fetch, which is where the live bug sits.
 *
 * Red until PLAN item 3 lands (builder-agents: never build a range from one
 * listing, say "No reliable market price found" instead).
 */
import { describe, expect, it } from "vitest";
import { ALL_FIXTURES } from "@pay-pals/contracts";
import type { PriceCheck } from "@pay-pals/contracts";
import { createBuyerPal, createChannel3PriceLookup, createFixtureCertLookup, createFixturePriceLookup } from "@pay-pals/agents";

/** What a trustworthy range looks like: either no range at all, or two different numbers from at least two priced listings. */
function expectSoundRange(check: PriceCheck, where: string): void {
  const priced = check.sources.filter((s) => typeof s.price === "number");
  const hasRange = check.marketLow > 0 || check.marketHigh > 0;
  if (!hasRange) {
    expect(check.marketLow, `${where}: no range means 0 to 0`).toBe(0);
    expect(check.marketHigh, `${where}: no range means 0 to 0`).toBe(0);
    return;
  }
  expect(priced.length, `${where}: a range needs at least two priced listings, got ${priced.length}`).toBeGreaterThanOrEqual(2);
  expect(check.marketLow, `${where}: low ${check.marketLow} equals high ${check.marketHigh}`).toBeLessThan(check.marketHigh);
}

const noCache = { async get() { return null; }, async set() {} };

/** A Channel3 search answer with the given USD offers, one product each. */
function channel3Response(prices: number[], title = "Sony PlayStation 5 Console Disc Edition CFI-1215A") {
  return {
    products: prices.map((price, i) => ({
      id: `p${i}`,
      title,
      brands: [{ id: "sony", name: "Sony" }],
      offers: [{ url: `https://shop${i}.example/ps5`, domain: `shop${i}.example`, price: { price, currency: "USD" }, availability: "InStock", condition: "new" }],
    })),
  };
}

function lookupOver(prices: number[]) {
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify(channel3Response(prices)), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { lookup: createChannel3PriceLookup("test-key", { fetchImpl, cache: noCache }), calls };
}

describe("fixture prices through the Buyer Pal", () => {
  const buyerPal = createBuyerPal({ anthropic: null, priceLookup: createFixturePriceLookup(), certLookup: createFixtureCertLookup() });

  it.each(ALL_FIXTURES.map((f) => [f.id, f] as const))("%s: the verdict's range is two numbers from several sources", async (_id, fixture) => {
    const { data: verdict } = await buyerPal.review(fixture.cards.at(-1)!, fixture.chat, { dealId: fixture.deal.id, seller: fixture.seller, sellerJoined: true });
    expect(verdict.priceCheck, "a verdict on a card carries a price check").not.toBeNull();
    expectSoundRange(verdict.priceCheck!, `${fixture.id} verdict`);
    expect(verdict.priceCheck!.provider).toBe("fixture");
    expectSoundRange(fixture.marketPrice, `${fixture.id} fixture marketPrice`);
  });
});

describe("Channel3 ranges over a fake fetch", () => {
  const query = { brand: "Sony", model: "PlayStation 5 disc edition, CFI-1215A", condition: "good" };

  it("several distinct listings give a real range with low below high", async () => {
    const { lookup, calls } = lookupOver([449.99, 479, 499.99, 529, 549.99]);
    const check = await lookup.priceRange(query);
    expect(calls).toHaveLength(1);
    expect(check.provider).toBe("channel3");
    expectSoundRange(check, "five listings");
    expect(check.sources.filter((s) => typeof s.price === "number").length).toBeGreaterThanOrEqual(2);
  });

  it("a single listing never becomes a range (PLAN item 3)", async () => {
    const { lookup } = lookupOver([499.99]);
    const check = await lookup.priceRange(query);
    expect(check.provider).toBe("channel3");
    expectSoundRange(check, "one listing");
    expect(check.marketLow).toBe(0);
    expect(check.marketHigh).toBe(0);
    expect(check.sources.some((s) => /no reliable market price/i.test(s.name))).toBe(true);
  });

  it("identical prices from several copies of one listing do not pass as a range (PLAN item 3)", async () => {
    const { lookup } = lookupOver([499.99, 499.99, 499.99]);
    const check = await lookup.priceRange(query);
    expectSoundRange(check, "three copies of one price");
  });

  it("a Buyer Pal on a single-listing Channel3 answer does not report a market range", async () => {
    const { lookup } = lookupOver([499.99]);
    const buyerPal = createBuyerPal({ anthropic: null, priceLookup: lookup, certLookup: createFixtureCertLookup() });
    const fixture = ALL_FIXTURES.find((f) => f.id === "clean-ps5")!;
    const { data: verdict, palMessage } = await buyerPal.review(fixture.cards.at(-1)!, fixture.chat, { dealId: fixture.deal.id, seller: fixture.seller, sellerJoined: true });
    expectSoundRange(verdict.priceCheck!, "verdict on one listing");
    expect(palMessage).not.toMatch(/\$[\d.]+ to \$[\d.]+/);
    expect(verdict.flags.map((f) => f.code)).not.toContain("PRICE_FAR_BELOW_MARKET");
  });
});
