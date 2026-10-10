/**
 * Real Claude calls. Skipped unless ANTHROPIC_API_KEY is set (in the
 * environment or in .env.local at the repo root) and SKIP_REAL_TESTS is not.
 * Nine calls total. Verdicts and photo reads are printed so a reviewer can
 * read them.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import type { Photo, Verdict } from "@pay-pals/contracts";
import { CLEAN_MODEL, CLEAN_SERIAL, cleanPs5, hasStop, fakeSlab } from "@pay-pals/contracts";
import type { ImageFetcher } from "../vision/fetch-image";
import { readPhoto } from "../vision/read-photo";
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

  it("fake-slab stops even though the cert matches, and asks for the slab beside a dated note", async () => {
    const pal = createBuyerPal({ anthropic, priceLookup, certLookup: createFixtureCertLookup() });
    const { data: verdict } = await pal.review(fakeSlab.cards.at(-1)!, fakeSlab.chat, { seller: fakeSlab.seller });
    print("fake-slab v1", verdict);
    expect(verdict.certCheck?.matches).toBe(true);
    const codes = verdict.flags.map((f) => f.code);
    for (const code of fakeSlab.expectedVerdict.requiredFlags) expect(codes).toContain(code);
    expect(codes).not.toContain("CERT_MISMATCH");
    expect(verdict.overall).toBe("stop");
    expect(verdict.questionsForSeller).toContain("Can you send one photo of the slab next to a handwritten note with your name and today's date on it?");
    expect(verdict.palMessage.length).toBeGreaterThan(20);
    expect(verdict.palMessage).not.toMatch(/[—!]/);
    expect(verdict.palMessage).not.toMatch(/verif|authentic/i);
    // The slab review is the longest message the pal writes, so it gets the most room.
  }, 120_000);

  it("clean-ps5 v1 (before the serial close-up) is go, with at most three questions", async () => {
    const pal = createBuyerPal({ anthropic, priceLookup });
    const { data: verdict } = await pal.review(cleanPs5.cards[0]!, cleanPs5.chat.slice(0, 2), { seller: cleanPs5.seller });
    print("clean-ps5 v1", verdict);
    expect(hasStop(verdict.flags)).toBe(false);
    expect(verdict.overall).toBe("go");
    expect(verdict.questionsForSeller.length).toBeLessThanOrEqual(3);
  }, 60_000);

  it("clean-ps5 v2 (serial close-up added) is go", async () => {
    const pal = createBuyerPal({ anthropic, priceLookup });
    const { data: verdict } = await pal.review(cleanPs5.cards[1]!, cleanPs5.chat, { seller: cleanPs5.seller });
    print("clean-ps5 v2", verdict);
    expect(hasStop(verdict.flags)).toBe(false);
    expect(verdict.overall).toBe("go");
  }, 60_000);

  it("Seller Pal drafts the clean card, takes the box label number and leaves the item serial empty", async () => {
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
    expect(card.serial).toBeNull();
    expect(card.boxSerial).toBe(CLEAN_SERIAL);
    expect(palMessage).toContain("A box label is not the item");
    expect(card.askingPrice).toBe(420);
  }, 60_000);
});

/**
 * The clean deal's wide shot of the console back, read with the real model.
 * The sticker is in frame and a few pixels tall, and the scenario depends on
 * it reading as unreadable so the Buyer Pal asks for the close-up instead of
 * arguing with the box label about one character. Run twice, because the
 * failure this guards against was intermittent: before the legibility gate the
 * same photo came back AJ164952580 five times in six and AJ16495258Q once.
 */
describe.skipIf(!enabled)("real Claude vision on the demo photos", () => {
  const anthropic = new Anthropic();
  const photosDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "assets", "demo-photos");
  const fromDisk: ImageFetcher = async (url) => ({
    data: readFileSync(join(photosDir, new URL(url).pathname.replace("/fixtures/", ""))).toString("base64"),
    mediaType: "image/jpeg",
  });
  const read = (photo: Photo) =>
    readPhoto(photo, { client: anthropic, fetchImage: fromDisk, photoBaseUrl: "https://demo.invalid", hints: { brand: "Sony", model: `PlayStation 5 disc edition, ${CLEAN_MODEL}` } });

  it.each([1, 2])("the wide console back reads as unreadable, not as a serial (run %i)", async () => {
    const reading = await read(cleanPs5.cards[0]!.photos[0]!);
    console.log(`console-back: serial=${reading.serial} illegible=${reading.serialIllegible} reason=${reading.serialIllegibleReason}`);
    expect(reading.serial).toBeNull();
    // Model and brand are large print and must still come through.
    expect(reading.model).toMatch(/CFI-1015A/i);
  }, 60_000);

  it("the serial close-up still reads, so the gate did not just turn every serial off", async () => {
    const reading = await read(cleanPs5.cards[1]!.photos[3]!);
    console.log(`console-serial-closeup: serial=${reading.serial} illegible=${reading.serialIllegible}`);
    expect(reading.serial).toBe(CLEAN_SERIAL);
    expect(reading.serialOn).toBe("item");
    expect(reading.serialIllegible).toBe(false);
  }, 60_000);

  it("the arrival close-up reads, so the arrival check can still confirm the unit", async () => {
    const reading = await read(cleanPs5.arrivalPhotos[0]!);
    console.log(`arrival-console-serial: serial=${reading.serial} illegible=${reading.serialIllegible}`);
    expect(reading.serial).toBe(CLEAN_SERIAL);
    expect(reading.serialOn).toBe("item");
  }, 60_000);
});
