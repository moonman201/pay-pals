/**
 * Real Channel3 call. Skipped unless CHANNEL3_API_KEY is set (in the
 * environment or in .env.local at the repo root). The response is cached in
 * packages/agents/.cache so repeat runs spend nothing.
 */
import { describe, expect, it } from "vitest";
import { createChannel3PriceLookup } from "../price/channel3-lookup";
import { hasKey } from "../testing/env";

const enabled = hasKey("CHANNEL3_API_KEY");

describe.skipIf(!enabled)("real Channel3 (needs CHANNEL3_API_KEY)", () => {
  it("returns a USD range with sources for the Garmin Fenix 7 Pro", async () => {
    const lookup = createChannel3PriceLookup(process.env.CHANNEL3_API_KEY!);
    const check = await lookup.priceRange({ brand: "Garmin", model: "Fenix 7 Pro Sapphire Solar 47mm", condition: "good" });
    console.log(`Channel3 range: $${check.marketLow} to $${check.marketHigh} from ${check.sources.length} sources`);
    expect(check.provider).toBe("channel3");
    expect(check.currency).toBe("USD");
    expect(check.marketLow).toBeGreaterThan(0);
    expect(check.marketHigh).toBeGreaterThanOrEqual(check.marketLow);
    expect(check.sources.length).toBeGreaterThan(0);
    expect(check.sources[0]!.url).toMatch(/^https?:\/\//);
  }, 30_000);
});
