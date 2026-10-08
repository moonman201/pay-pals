/**
 * Real Claude calls. Skipped unless ANTHROPIC_API_KEY is set (in the
 * environment or in .env.local at the repo root) and SKIP_REAL_TESTS is not.
 * Four calls total. Verdicts are printed so a reviewer can read them.
 */
import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import type { Verdict } from "@pay-pals/contracts";
import { CLEAN_SERIAL, cleanPs5, hasStop, fakeSlab } from "@pay-pals/contracts";
import { createBuyerPal } from "../buyer/buyer-pal";
import { createFixtureCertLookup } from "../cert/fixture-lookup";
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

  it("fake-slab still stops with the required flags, including CERT_MISMATCH, after the model weighs in", async () => {
    const pal = createBuyerPal({ anthropic, priceLookup, certLookup: createFixtureCertLookup() });
    const { data: verdict } = await pal.review(fakeSlab.cards.at(-1)!, fakeSlab.chat, { seller: fakeSlab.seller });
    print("fake-slab v1", verdict);
    expect(verdict.certCheck?.matches).toBe(false);
    const codes = verdict.flags.map((f) => f.code);
    for (const code of fakeSlab.expectedVerdict.requiredFlags) expect(codes).toContain(code);
    expect(verdict.overall).toBe("stop");
    expect(verdict.palMessage.length).toBeGreaterThan(20);
    expect(verdict.palMessage).not.toMatch(/[—!]/);
  }, 60_000);

  it("clean-ps5 v1 (before the Console Information photo) is go, with at most three questions", async () => {
    const pal = createBuyerPal({ anthropic, priceLookup });
    const { data: verdict } = await pal.review(cleanPs5.cards[0]!, cleanPs5.chat.slice(0, 2), { seller: cleanPs5.seller });
    print("clean-ps5 v1", verdict);
    expect(hasStop(verdict.flags)).toBe(false);
    expect(verdict.overall).toBe("go");
    expect(verdict.questionsForSeller.length).toBeLessThanOrEqual(3);
  }, 60_000);

  it("clean-ps5 v2 (Console Information photo added) is go", async () => {
    const pal = createBuyerPal({ anthropic, priceLookup });
    const { data: verdict } = await pal.review(cleanPs5.cards[1]!, cleanPs5.chat, { seller: cleanPs5.seller });
    print("clean-ps5 v2", verdict);
    expect(hasStop(verdict.flags)).toBe(false);
    expect(verdict.overall).toBe("go");
  }, 60_000);

  it("Seller Pal drafts the clean card and keeps both serials from the photo descriptions", async () => {
    const pal = createSellerPal({ anthropic });
    const { data: card, palMessage } = await pal.buildCard({
      dealId: cleanPs5.deal.id,
      listingText: cleanPs5.listingText,
      photos: cleanPs5.listingPhotos,
      sellerNotes: cleanPs5.sellerNotes,
      sellerPaypalEmail: cleanPs5.seller.email,
    });
    console.log(`clean-ps5 card: ${card.brand} / ${card.model} / serial ${card.serial} / box ${card.boxSerial} / $${card.askingPrice}\n  pal: ${palMessage}`);
    expect(card.brand.toLowerCase()).toBe("sony");
    expect(card.model.toLowerCase()).toMatch(/playstation 5|ps5/);
    expect(card.model.toLowerCase()).toContain("cfi-1215a");
    expect(card.serial).toBe(CLEAN_SERIAL);
    expect(card.boxSerial).toBe(CLEAN_SERIAL);
    expect(card.askingPrice).toBe(420);
  }, 60_000);
});
