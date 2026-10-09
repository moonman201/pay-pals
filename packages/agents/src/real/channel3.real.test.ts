/**
 * Real Channel3 call. Skipped unless CHANNEL3_API_KEY is set (in the
 * environment or in .env.local at the repo root) and SKIP_REAL_TESTS is not.
 * The response is cached in packages/agents/.cache for a day, so repeat runs
 * spend nothing. Run with PAY_PALS_DEBUG=1 to see the credit log line.
 */
import { describe, expect, it } from "vitest";
import { channel3CallCount } from "../price/channel3-api";
import { createChannel3PriceLookup } from "../price/channel3-lookup";
import { priceBelowMarketRule } from "../rules/price-below-market";
import { card } from "../testing/builders";
import { hasKey } from "../testing/env";

const enabled = hasKey("CHANNEL3_API_KEY");

describe.skipIf(!enabled)("real Channel3 (needs CHANNEL3_API_KEY)", () => {
  it("returns a USD range with sources for the Sony PlayStation 5 disc edition", async () => {
    const before = channel3CallCount();
    const lookup = createChannel3PriceLookup(process.env.CHANNEL3_API_KEY!);
    const check = await lookup.priceRange({ brand: "Sony", model: "PlayStation 5 disc edition CFI-1015A", condition: "good" });
    const liveCalls = channel3CallCount() - before;
    console.log(
      `Channel3 range for a used (good) card: $${check.marketLow} to $${check.marketHigh} from ${check.sources.length} sources, ${liveCalls} live call${liveCalls === 1 ? "" : "s"} (0 means the disk cache answered)`,
    );
    for (const source of check.sources) console.log(`  ${source.condition ?? "note"} ${source.price !== undefined ? `$${source.price} ` : ""}${source.name}`);
    for (const ask of [220, 410, 420]) {
      const flags = priceBelowMarketRule({ card: card({ askingPrice: ask }), chat: [], priceCheck: check });
      console.log(`  ask $${ask}: ${flags.length === 0 ? "no price flag (go)" : `${flags[0]!.code} ${flags[0]!.severity}`} at ${Math.round((ask / check.marketLow) * 100)}% of the low end`);
    }
    expect(check.provider).toBe("channel3");
    expect(check.currency).toBe("USD");
    expect(liveCalls).toBeLessThanOrEqual(1);
    const priced = check.sources.filter((s) => s.price !== undefined);
    if (check.marketLow > 0) {
      // A real range: strictly wider than a point, built from at least three listings.
      expect(check.marketHigh).toBeGreaterThan(check.marketLow);
      expect(priced.length).toBeGreaterThanOrEqual(3);
      expect(priced[0]!.url).toMatch(/^https?:\/\//);
    } else {
      expect(check.sources[0]!.name).toBe("No reliable market price found");
    }
  }, 30_000);
});
