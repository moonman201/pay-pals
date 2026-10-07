/**
 * Real Claude calls. Skipped unless ANTHROPIC_API_KEY is set (in the
 * environment or in .env.local at the repo root) and SKIP_REAL_TESTS is not.
 * Four calls total. Verdicts are printed so a reviewer can read them.
 */
import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import type { Verdict } from "@pay-pals/contracts";
import { CLEAN_SERIAL, cleanGarmin, hasStop, scamGarmin } from "@pay-pals/contracts";
import { createBuyerPal } from "../buyer/buyer-pal";
import { createSellerPal } from "../seller/seller-pal";
import { createFixturePriceLookup } from "../price/fixture-lookup";
import { hasKey } from "../testing/env";

const enabled = hasKey("ANTHROPIC_API_KEY");

function print(label: string, verdict: Verdict): void {
  console.log(
    `${label}: overall=${verdict.overall} flags=[${verdict.flags.map((f) => `${f.code}:${f.severity}${f.raisedByRule ? "" : "(model)"}`).join(", ")}] questions=${JSON.stringify(verdict.questionsForSeller)}\n  pal: ${verdict.palMessage}`,
  );
}

describe.skipIf(!enabled)("real Claude (needs ANTHROPIC_API_KEY)", () => {
  const anthropic = new Anthropic();
  const priceLookup = createFixturePriceLookup();

  it("scam-garmin still stops with the required flags after the model weighs in", async () => {
    const pal = createBuyerPal({ anthropic, priceLookup });
    const { data: verdict } = await pal.review(scamGarmin.cards.at(-1)!, scamGarmin.chat, { seller: scamGarmin.seller });
    print("scam-garmin v1", verdict);
    const codes = verdict.flags.map((f) => f.code);
    for (const code of scamGarmin.expectedVerdict.requiredFlags) expect(codes).toContain(code);
    expect(verdict.overall).toBe("stop");
    expect(verdict.palMessage.length).toBeGreaterThan(20);
    expect(verdict.palMessage).not.toMatch(/[—!]/);
  }, 60_000);

  it("clean-garmin v1 (before the battery photo) is go, with at most three questions", async () => {
    const pal = createBuyerPal({ anthropic, priceLookup });
    const { data: verdict } = await pal.review(cleanGarmin.cards[0]!, cleanGarmin.chat.slice(0, 2), { seller: cleanGarmin.seller });
    print("clean-garmin v1", verdict);
    expect(hasStop(verdict.flags)).toBe(false);
    expect(verdict.overall).toBe("go");
    expect(verdict.questionsForSeller.length).toBeLessThanOrEqual(3);
  }, 60_000);

  it("clean-garmin v2 (battery photo added) is go", async () => {
    const pal = createBuyerPal({ anthropic, priceLookup });
    const { data: verdict } = await pal.review(cleanGarmin.cards[1]!, cleanGarmin.chat, { seller: cleanGarmin.seller });
    print("clean-garmin v2", verdict);
    expect(hasStop(verdict.flags)).toBe(false);
    expect(verdict.overall).toBe("go");
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
