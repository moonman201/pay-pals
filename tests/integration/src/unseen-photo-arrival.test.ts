/**
 * Does the Buyer Pal read the image, or the caption?
 *
 * Every other photo test in this repo hands a pal a photo the fixtures
 * already describe, so a pal that only paraphrased the caption would pass.
 * This one takes the single demo photo no fixture has ever referenced,
 * `assets/demo-photos/fake-slab/slab-back.jpg` (the back of the graded slab,
 * shot for the fake-slab scenario and then left unused, see SHOTLIST.md),
 * and hands it to `BuyerPal.checkArrival` as the arrival photo for the clean
 * PlayStation 5 deal, under the clean deal's own arrival caption, word for
 * word, serial and all.
 *
 * So the caption says: the console arrived, and the number under its barcode
 * is AJ164952580, the locked card's serial.
 * The pixels say: a slabbed Pokemon card on a wooden table, no console
 * anywhere, and the only number printed on it is the grader's cert 72096346.
 *
 * A pal that goes by the caption reports serial AJ164952580 and says the
 * arrival matches. A pal that looks at the picture cannot, and the mismatch
 * it names has to be one it actually read. That is the whole test.
 *
 * The real-model case needs ANTHROPIC_API_KEY and is skipped under
 * SKIP_REAL_TESTS=1, like every other real-model test here. One Claude call.
 *
 * Corrected 2026-10-10 for contracts v1.8.0, which replaced
 * `ArrivalCheck.matches: boolean` with a three-value `outcome`. This case
 * asserted `matches: false`, and the new union splits that into two different
 * answers, so it had to be re-decided rather than translated. It is a
 * `mismatch`: a graded Pokemon card against a card describing a Sony
 * PlayStation is a difference the pal can settle, and nothing about it is a
 * near miss. Letting it drift to `inconclusive` would mean the view no longer
 * tells a buyer the wrong item arrived, so the outcome is named exactly.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALL_FIXTURES, CLEAN_SERIAL, cleanPs5 } from "@pay-pals/contracts";
import type { ItemCard, Photo } from "@pay-pals/contracts";
import { createAnthropicClientFromEnv, createBuyerPal, createFixturePriceLookup } from "@pay-pals/agents";
import { LOCAL_PHOTO_BASE, fileImageFetcher } from "./local-images";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");

/** The one committed demo photo that no scenario fixture points at. */
const UNSEEN_PHOTO = resolve(REPO_ROOT, "assets", "demo-photos", "fake-slab", "slab-back.jpg");
/** Printed on the grader's label in that photo, and on no PlayStation. */
const CERT_ON_THE_SLAB = "72096346";

/**
 * A URL that says nothing about the subject, so the caption is the only
 * thing pulling the pal the wrong way. local-images.ts answers it from disk.
 */
const PHOTO_URL = `${LOCAL_PHOTO_BASE}/arrival/photo-1.jpg`;

/** The clean deal's own arrival caption, copied word for word onto a photo of something else. */
const LYING_CAPTION = cleanPs5.arrivalPhotos[0]!.whatItShows;

const arrivalPhoto: Photo = { url: PHOTO_URL, whatItShows: LYING_CAPTION, addedBy: "buyer", addedAt: new Date().toISOString() };

/** The locked card of the clean deal: a Sony PlayStation 5 whose serial is on the card. */
const lockedCard: ItemCard = { ...cleanPs5.cards.at(-1)!, lockedAt: new Date().toISOString() };

const fetchLocalFile = fileImageFetcher({ [PHOTO_URL]: UNSEEN_PHOTO });

/** Every photo URL any fixture carries, in any slot. */
function everyFixturePhotoUrl(): string[] {
  return ALL_FIXTURES.flatMap((f) => [
    ...f.listingPhotos,
    ...f.cards.flatMap((c) => c.photos),
    ...f.chat.flatMap((m) => m.photos ?? []),
    ...(f.shipment?.packingPhotos ?? []),
    ...f.arrivalPhotos,
  ]).map((p) => p.url);
}

const realClaude = process.env.SKIP_REAL_TESTS ? null : createAnthropicClientFromEnv();

describe("a photo the fixtures have never seen", () => {
  it("is on disk, and no fixture anywhere points at it", () => {
    expect(existsSync(UNSEEN_PHOTO), `${UNSEEN_PHOTO} is missing`).toBe(true);
    const used = everyFixturePhotoUrl();
    expect(used.filter((url) => url.endsWith("fake-slab/slab-back.jpg"))).toEqual([]);
    // The premise of the real case below: nothing in the fixture set describes this picture,
    // so anything the pal says about it came from the pixels.
    expect(used.length).toBeGreaterThan(0);
  });

  it("carries a number that belongs to no PlayStation, so a mismatch has to be read, not recited", () => {
    expect(lockedCard.serial).toBe(CLEAN_SERIAL);
    expect(LYING_CAPTION).toContain(CLEAN_SERIAL);
    expect(CERT_ON_THE_SLAB).not.toBe(CLEAN_SERIAL);
  });

  // One real Claude vision call. Never under SKIP_REAL_TESTS=1.
  it.skipIf(!realClaude)("the arrival check names what it saw, not what the caption claimed", async () => {
    const pal = createBuyerPal({ anthropic: realClaude, priceLookup: createFixturePriceLookup(), fetchImage: fetchLocalFile });
    const { data: check } = await pal.checkArrival(lockedCard, [arrivalPhoto]);

    console.log(
      `unseen photo (${UNSEEN_PHOTO}) against the clean PS5 locked card\n` +
        `  outcome: ${check.outcome}\n` +
        `  observed: ${JSON.stringify(check.observed)}\n` +
        `  mismatches: ${JSON.stringify(check.mismatches, null, 2)}\n` +
        `  pal: ${check.palMessage}`,
    );

    // The caption promised the console and its serial. The picture has neither.
    // A mismatch and not the near-miss band: the brands differ outright, which is settled, not unsettled.
    expect(check.outcome).toBe("mismatch");
    expect(check.unsettled ?? [], "a different object is not an unsettled comparison").toEqual([]);
    expect(check.observed.serial).not.toBe(CLEAN_SERIAL);
    expect(check.mismatches.length).toBeGreaterThan(0);
    expect(check.palMessage).not.toContain("matches the locked card");

    // The locked card's serial may appear as the expectation it failed to meet, never as something
    // the pal claims to have seen. The caption is the only place that number could have come from.
    for (const mismatch of check.mismatches) expect(mismatch.observed).not.toContain(CLEAN_SERIAL);

    // And it must not fall back to the caption or to the sentences the Oct 7 review banned.
    expect(check.palMessage).not.toMatch(/could not open the photo files/i);
    expect(check.palMessage).not.toMatch(/went by the photo descriptions/i);
    expect(check.palMessage).not.toMatch(/photo description/i);
  }, 120_000);
});
