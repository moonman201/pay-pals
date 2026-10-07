/**
 * Real Claude calls. Skipped unless ANTHROPIC_API_KEY is set (in the
 * environment or in .env.local at the repo root). Three calls total.
 */
import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { CLEAN_SERIAL, cleanGarmin, hasStop, scamGarmin } from "@pay-pals/contracts";
import { createBuyerPal } from "../buyer/buyer-pal";
import { createSellerPal } from "../seller/seller-pal";
import { createFixturePriceLookup } from "../price/fixture-lookup";
import { hasKey } from "../testing/env";

const enabled = hasKey("ANTHROPIC_API_KEY");

describe.skipIf(!enabled)("real Claude (needs ANTHROPIC_API_KEY)", () => {
  const anthropic = new Anthropic();
  const priceLookup = createFixturePriceLookup();

  it("scam-garmin still stops with the required flags after the model weighs in", async () => {
    const pal = createBuyerPal({ anthropic, priceLookup });
    const { data: verdict } = await pal.review(scamGarmin.cards.at(-1)!, scamGarmin.chat, { seller: scamGarmin.seller });
    const codes = verdict.flags.map((f) => f.code);
    for (const code of scamGarmin.expectedVerdict.requiredFlags) expect(codes).toContain(code);
    expect(verdict.overall).toBe("stop");
    expect(verdict.palMessage.length).toBeGreaterThan(20);
    expect(verdict.palMessage).not.toMatch(/[—!]/);
  }, 60_000);

  it("clean-garmin gets go or caution with no stop flag", async () => {
    const pal = createBuyerPal({ anthropic, priceLookup });
    const { data: verdict } = await pal.review(cleanGarmin.cards.at(-1)!, cleanGarmin.chat, { seller: cleanGarmin.seller });
    expect(hasStop(verdict.flags)).toBe(false);
    expect(["go", "caution"]).toContain(verdict.overall);
  }, 60_000);

  it("Seller Pal drafts the clean card and keeps the serial from the photo description", async () => {
    const pal = createSellerPal({ anthropic });
    const { data: card } = await pal.buildCard({
      dealId: cleanGarmin.deal.id,
      listingText: cleanGarmin.listingText,
      photos: cleanGarmin.listingPhotos,
      sellerNotes: cleanGarmin.sellerNotes,
      sellerPaypalEmail: cleanGarmin.seller.email,
    });
    expect(card.brand.toLowerCase()).toBe("garmin");
    expect(card.model.toLowerCase()).toContain("fenix 7");
    expect(card.serial).toBe(CLEAN_SERIAL);
    expect(card.askingPrice).toBe(475);
  }, 60_000);
});
