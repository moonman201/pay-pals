/**
 * Real Channel3 call. Skipped unless CHANNEL3_API_KEY is set (in the
 * environment or in .env.local at the repo root) and SKIP_REAL_TESTS is not.
 * The response is cached in packages/agents/.cache for a day, so repeat runs
 * spend nothing. Run with PAY_PALS_DEBUG=1 to see the credit log line.
 */
import { describe, expect, it } from "vitest";
import { channel3CallCount } from "../price/channel3-api";
import { createChannel3PriceLookup } from "../price/channel3-lookup";
import { hasKey } from "../testing/env";

const enabled = hasKey("CHANNEL3_API_KEY");

describe.skipIf(!enabled)("real Channel3 (needs CHANNEL3_API_KEY)", () => {
  it("returns a USD range with sources for the Sony PlayStation 5 disc edition", async () => {
    const before = channel3CallCount();
    const lookup = createChannel3PriceLookup(process.env.CHANNEL3_API_KEY!);
    const check = await lookup.priceRange({ brand: "Sony", model: "PlayStation 5 disc edition CFI-1215A", condition: "good" });
    const liveCalls = channel3CallCount() - before;
    console.log(
      `Channel3 range: $${check.marketLow} to $${check.marketHigh} from ${check.sources.length} sources, ${liveCalls} live call${liveCalls === 1 ? "" : "s"} (0 means the disk cache answered)`,
    );
    for (const source of check.sources) console.log(`  ${source.condition ?? "?"} $${source.price} ${source.name}`);
    expect(check.provider).toBe("channel3");
    expect(check.currency).toBe("USD");
    expect(check.marketLow).toBeGreaterThan(0);
    expect(check.marketHigh).toBeGreaterThanOrEqual(check.marketLow);
    expect(check.sources.length).toBeGreaterThan(0);
    expect(check.sources[0]!.url).toMatch(/^https?:\/\//);
    expect(liveCalls).toBeLessThanOrEqual(1);
  }, 30_000);
});
