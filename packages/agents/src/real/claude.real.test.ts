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
import { CLEAN_SERIAL, cleanPs5, hasStop, fakeSlab } from "@pay-pals/contracts";
import type { ImageFetcher } from "../vision/fetch-image";
import { readPhoto } from "../vision/read-photo";
import { createBuyerPal } from "../buyer/buyer-pal";
import { CONSOLE_SERIAL_QUESTION } from "../buyer/proof-question";
import { createFixtureCertLookup } from "../cert/fixture-lookup";
import { createSellerPal } from "../seller/seller-pal";
import { createFixturePriceLookup } from "../price/fixture-lookup";
import { hasKey } from "../testing/env";

const enabled = hasKey("ANTHROPIC_API_KEY");

/**
 * Timeouts here guard against a hang. They are not a performance budget, and
 * nothing in this file asserts how fast a pal is.
 *
 * They were raised on 2026-10-10 after the keyed gate went red on
 * "clean-ps5 v2 is go" with "Test timed out in 60000ms". Nothing had got
 * slower: the same test passed in 27s on a re-run of the whole file at a
 * higher limit. The old 60s limits were simply inside the range that ordinary
 * latency variance on a real network call reaches, so the file failed on
 * weather rather than on an answer.
 *
 * Measured on that re-run, all nine passing (milliseconds):
 *
 *   fake-slab v1 stops                     64,987
 *   clean-ps5 v1 is go                     17,708
 *   clean-ps5 v2 is go                     27,408
 *   Seller Pal drafts the clean card        2,597
 *   wide console back, run 1                6,371
 *   wide console back, run 2                7,964
 *   serial close-up still reads             2,589
 *   arrival close-up reads                  6,849
 *   v1 on real photos, with reasons        33,251
 *
 * Note the shape of the failure: the test that timed out normally takes 27s,
 * and the slowest test in the file took 65s against a limit of 120s. A limit
 * near twice the observed time is the marginal case that bit us, so these are
 * set well clear of it rather than just above the worst number seen.
 */

/** A whole pal run: several model calls in sequence, and the review can re-ask once. Worst observed 65s. */
const PAL_RUN_MS = 240_000;

/** One vision read of one photo: a single call. Worst observed 8s. */
const ONE_READ_MS = 120_000;

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
  }, PAL_RUN_MS);

  it("clean-ps5 v1 (before the serial close-up) is caution for the box-only serial, with at most three questions", async () => {
    const pal = createBuyerPal({ anthropic, priceLookup });
    const { data: verdict } = await pal.review(cleanPs5.cards[0]!, cleanPs5.chat.slice(0, 2), { seller: cleanPs5.seller });
    print("clean-ps5 v1", verdict);
    expect(hasStop(verdict.flags)).toBe(false);
    expect(verdict.overall).toBe("caution");
    expect(verdict.questionsForSeller.length).toBeLessThanOrEqual(3);
  }, PAL_RUN_MS);

  it("clean-ps5 v2 (serial close-up added) is go", async () => {
    const pal = createBuyerPal({ anthropic, priceLookup });
    const { data: verdict } = await pal.review(cleanPs5.cards[1]!, cleanPs5.chat, { seller: cleanPs5.seller });
    print("clean-ps5 v2", verdict);
    expect(hasStop(verdict.flags)).toBe(false);
    expect(verdict.overall).toBe("go");
  }, PAL_RUN_MS);

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
  }, PAL_RUN_MS);
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
    readPhoto(photo, { client: anthropic, fetchImage: fromDisk, photoBaseUrl: "https://demo.invalid", hints: { brand: "Sony", model: cleanPs5.cards[0]!.model } });

  it.each([1, 2])("the wide console back reads as unreadable, not as a serial (run %i)", async () => {
    const reading = await read(cleanPs5.cards[0]!.photos[0]!);
    console.log(`console-back: serial=${reading.serial} illegible=${reading.serialIllegible} reason=${reading.serialIllegibleReason}`);
    expect(reading.serial).toBeNull();
    /**
     * Something identifying the product still comes through off the large print, which is what
     * shows the gate narrowed the serial rather than blinding the read.
     *
     * Relaxed 2026-10-11 after this failed on a repeat run reading "PlayStation 5" where it had
     * read "CFI-1015A". Both are printed on that panel and both are correct, so pinning one of
     * them was pinning a wording again. The serial assertion above is the one that matters and it
     * held on every run.
     */
    expect(reading.model).toMatch(/CFI-?\s*1015A|PlayStation\s*5/i);
  }, ONE_READ_MS);

  it("the serial close-up still reads, so the gate did not just turn every serial off", async () => {
    const reading = await read(cleanPs5.cards[1]!.photos[3]!);
    console.log(`console-serial-closeup: serial=${reading.serial} illegible=${reading.serialIllegible}`);
    expect(reading.serial).toBe(CLEAN_SERIAL);
    expect(reading.serialOn).toBe("item");
    expect(reading.serialIllegible).toBe(false);
  }, ONE_READ_MS);

  it("the arrival close-up reads, so the arrival check can still confirm the unit", async () => {
    const reading = await read(cleanPs5.arrivalPhotos[0]!);
    console.log(`arrival-console-serial: serial=${reading.serial} illegible=${reading.serialIllegible}`);
    expect(reading.serial).toBe(CLEAN_SERIAL);
    expect(reading.serialOn).toBe("item");
  }, ONE_READ_MS);

  /**
   * The clean deal's first card, reviewed with the real model and the real
   * photos. This is the run that shows items C5 and the serial gate agreeing:
   * the wide shot gives no number, the pal says so in couldNotVerify, and it
   * asks for the close-up in both wouldChangeMyMind and questionsForSeller.
   */
  it("reviews clean-ps5 v1 on the real photos and shows its reasons", async () => {
    const pal = createBuyerPal({ anthropic, priceLookup: createFixturePriceLookup(), fetchImage: fromDisk, photoBaseUrl: "https://demo.invalid" });
    const { data: verdict } = await pal.review(cleanPs5.cards[0]!, cleanPs5.chat.slice(0, 2), { seller: cleanPs5.seller });
    print("clean-ps5 v1 (real photos)", verdict);
    for (const group of ["checked", "found", "couldNotVerify", "wouldChangeMyMind"] as const) {
      console.log(`  ${group}:\n${verdict.reasoning![group].map((line) => `    - ${line}`).join("\n")}`);
    }
    expect(verdict.overall).not.toBe("stop");
    const reasoning = verdict.reasoning!;
    for (const group of ["checked", "found", "couldNotVerify", "wouldChangeMyMind"] as const) expect(Array.isArray(reasoning[group])).toBe(true);
    expect(reasoning.checked.length).toBeGreaterThan(0);
    expect(reasoning.couldNotVerify.length).toBeGreaterThan(0);
    /**
     * Corrected 2026-10-11. This matched the literal phrase "could not read it", which the
     * shortening pass changed, so a wording edit turned the keyed gate red on a test whose point
     * has nothing to do with wording. It now pins the property: whatever the sentence is, the
     * pal has to say a serial was there and could not be read off the console, and has to ask
     * for the close-up. The exact words are allowed to move; the admission is not.
     */
    const couldNot = reasoning.couldNotVerify.join(" ");
    expect(couldNot).toMatch(/serial/i);
    expect(couldNot).toMatch(/could not read|not readable|too unclear|unreadable/i);
    // Deliberately no assertion that AJ164952580 is absent here. The first draft of this fix had
    // one and it failed on the third run, correctly: the card carries that number on its box
    // label, so a line reading "whether the console serial matches the box serial AJ164952580"
    // is honest. Banning the string would have pinned a wording again, one layer down.
    expect(reasoning.wouldChangeMyMind.join(" ")).toMatch(/close-up of the serial label/i);
    expect(verdict.questionsForSeller).toContain(CONSOLE_SERIAL_QUESTION);
  }, PAL_RUN_MS);
});
