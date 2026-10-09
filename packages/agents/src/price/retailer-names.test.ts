/**
 * Matt's call on 2026-10-09: the price panel shows counts and prices with
 * "via Channel3" and no retailer names. These tests prove no shop reaches the
 * model or any pal text, while the url on each source still carries it.
 */
import { describe, expect, it } from "vitest";
import type { EvidenceInput, PriceCheck } from "@pay-pals/contracts";
import { cleanPs5 } from "@pay-pals/contracts";
import { createBuyerPal } from "../buyer/buyer-pal";
import { listingCounts, shopNames } from "../buyer/review";
import { buildEvidencePack } from "../evidence/build-evidence-pack";
import { fakeClaude, promptText } from "../testing/fake-claude";
import type { Channel3SearchResponse } from "./channel3-api";
import { createChannel3PriceLookup } from "./channel3-lookup";
import type { DiskCache } from "../cache/disk-cache";

const DOMAINS = ["walmart.com", "gamestop.com", "bestbuy.com", "dell.com", "walmart", "gamestop", "bestbuy"];

const offer = (domain: string, price: number, condition: "new" | "used" = "new") => ({
  url: `https://${domain}/item/ps5`,
  domain,
  price: { price, compare_at_price: null, currency: "USD" },
  availability: "InStock" as const,
  condition,
});

const response: Channel3SearchResponse = {
  products: [
    { id: "1", title: "PlayStation 5 Disc Edition", offers: [offer("walmart.com", 499.99)] },
    { id: "2", title: "PlayStation 5 Disc Edition", offers: [offer("gamestop.com", 519.99)] },
    { id: "3", title: "PlayStation 5 Disc Edition", offers: [offer("bestbuy.com", 549.99)] },
    { id: "4", title: "PlayStation 5 Disc Edition", offers: [offer("dell.com", 470, "used")] },
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

const priceLookup = createChannel3PriceLookup("test-key", {
  cache: memoryCache(),
  fetchImpl: async () => new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } }),
});

/** Fails with the offending domain named, so a regression is readable. */
function expectNoRetailer(label: string, text: string): void {
  for (const domain of DOMAINS) expect(text.toLowerCase(), `${label} names ${domain}`).not.toContain(domain);
}

async function priceCheck(): Promise<PriceCheck> {
  return priceLookup.priceRange({ brand: "Sony", model: "PlayStation 5 disc edition, CFI-1015A", condition: "good" });
}

describe("Channel3 sources", () => {
  it("label listings neutrally and keep the retailer in the url and the price", async () => {
    const check = await priceCheck();
    const priced = check.sources.filter((s) => s.price !== undefined);
    expect(priced).toHaveLength(4);
    expect(priced.map((s) => s.name).sort()).toEqual(["Retail listing, new", "Retail listing, new", "Retail listing, new", "Used listing"]);
    for (const source of priced) expectNoRetailer("source name", source.name);
    // The url and the price are still there for the evidence pack and for our own debugging.
    expect(priced.map((s) => s.url)).toEqual([
      "https://walmart.com/item/ps5",
      "https://gamestop.com/item/ps5",
      "https://bestbuy.com/item/ps5",
      "https://dell.com/item/ps5",
    ]);
    expect(priced.map((s) => s.price)).toEqual([499.99, 519.99, 549.99, 470]);
    expect(priced.filter((s) => s.condition === "used")).toHaveLength(1);
    expect(shopNames(check).sort()).toEqual(["bestbuy.com", "dell.com", "gamestop.com", "walmart.com"]);
  });

  it("count the listings by condition without naming a shop", async () => {
    const check = await priceCheck();
    expect(listingCounts(check)).toBe("from 4 listings (3 new, 1 used)");
    expect(listingCounts({ ...check, sources: [{ name: "No reliable market price found" }] })).toBeNull();
  });
});

describe("no retailer reaches the model or the buyer", () => {
  const card = { ...cleanPs5.cards[0]!, askingPrice: 150 };
  const chat = cleanPs5.chat.slice(0, 2);

  it("the price line gives the range, the provider, the counts and the method note only", async () => {
    const model = fakeClaude((params) => (params.tools?.[0]?.name === "submit_review" ? { additional_flags: [], severity_raises: [], explanations: [], questions_for_seller: [], pal_message: "Stop, the price is far below market." } : null));
    const { data: verdict, palMessage } = await createBuyerPal({ anthropic: model, priceLookup }).review(card, chat);
    const shown = promptText(model.calls.find((c) => c.tools?.[0]?.name === "submit_review")!);
    expectNoRetailer("the model prompt", shown);
    expect(shown).toContain("Market range $349.99 to $384.99 (channel3, from 4 listings (3 new, 1 used); estimated for a used unit from new retail prices (good: 70% of new))");
    expect(shown).toContain("Name no shop or website in your message");

    expect(verdict.overall).toBe("stop");
    expectNoRetailer("the pal message", palMessage);
    for (const flag of verdict.flags) {
      expectNoRetailer(`${flag.code} evidence`, flag.evidence);
      expectNoRetailer(`${flag.code} explanation`, flag.explanation);
    }
    for (const question of verdict.questionsForSeller) expectNoRetailer("a question", question);
    expect(verdict.flags.find((f) => f.code === "PRICE_FAR_BELOW_MARKET")!.evidence).toBe("Asking price $150 against a market low of $349.99 (43% of the low end, source channel3)");
  });

  it("a model that names a shop is re-asked, then replaced by the rules-only message", async () => {
    const model = fakeClaude((params) =>
      params.tools?.[0]?.name === "submit_review"
        ? { additional_flags: [], severity_raises: [], explanations: [], questions_for_seller: [], pal_message: "Walmart and gamestop.com list this for about $500, so $150 is far too low." }
        : null,
    );
    const { palMessage } = await createBuyerPal({ anthropic: model, priceLookup }).review(card, chat);
    const reviews = model.calls.filter((c) => c.tools?.[0]?.name === "submit_review");
    expect(reviews).toHaveLength(2);
    expect(promptText(reviews[1]!)).toContain("do not name a shop or website");
    expectNoRetailer("the pal message", palMessage);
    expect(palMessage).toContain("a price far below market");
  });

  it("the rules-only message and the evidence summary name no shop", async () => {
    const offline = createBuyerPal({ anthropic: null, priceLookup });
    const fair = await offline.review({ ...card, askingPrice: 420 }, chat);
    expectNoRetailer("the rules-only message", fair.palMessage);
    expect(fair.palMessage).toContain("$349.99 to $384.99");
    for (const question of fair.data.questionsForSeller) expectNoRetailer("a question", question);

    const low = await offline.review(card, chat);
    const input: EvidenceInput = {
      deal: cleanPs5.deal,
      lockedCard: card,
      verdicts: [low.data, fair.data],
      arrivalCheck: null,
      messages: cleanPs5.chat,
      payment: cleanPs5.payment,
      shipment: cleanPs5.shipment,
      timeline: cleanPs5.timeline,
      requestedBy: "buyer",
    };
    const { data: pack, palMessage } = await buildEvidencePack(input, { anthropic: null });
    expectNoRetailer("the evidence summary", pack.summary);
    expectNoRetailer("the evidence pal message", palMessage);
    // The urls stay in the verdicts the pack carries, for the reviewer to follow.
    expect(JSON.stringify(pack.verdicts)).toContain("https://walmart.com/item/ps5");
  });
});
