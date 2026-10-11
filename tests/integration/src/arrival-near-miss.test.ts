/**
 * The third arrival outcome, end to end across the modules.
 *
 * Contracts v1.8.0 added `inconclusive` for one reason: a serial read off a
 * photo that is one character from the card. Nothing exercised that case.
 * None of the three scenario fixtures reaches it, and it cannot be reached
 * through the e2e suite at all, because that suite runs keyless: with no
 * model the arrival serial comes out of the photo's caption, which is a
 * typed number, and the band deliberately does not apply when neither side
 * was read off a picture. So the only place this case can be pinned is here,
 * across the Buyer Pal and the evidence pack, with a vision read supplied.
 *
 * What is pinned is the behaviour, not the wording:
 *
 *   - one character out comes back inconclusive, not mismatch, and what
 *     could not be settled is in `unsettled` rather than `mismatches`;
 *   - an inconclusive arrival does not invite a dispute, in the pal's own
 *     message or in the evidence pack built from it. That is the one with
 *     consequences: a buyer told to open a dispute over a misread character;
 *   - the pal names both numbers and claims neither outcome;
 *   - a serial that is genuinely different is still a mismatch, so the band
 *     has not swallowed wrong-item detection, which is the thing it must
 *     never do;
 *   - the two scoping conditions hold: no band when both numbers were typed
 *     rather than read, and no band on a short identifier.
 *
 * No network and no key: the vision read is supplied by a fake, because the
 * question is what the comparison does with a given pair of numbers, not
 * what a model reads off a picture today.
 *
 * STATE, 2026-10-10: six of these seven are red, and should be. `arrival.ts`
 * in packages/agents still returns the old boolean, so `outcome` is
 * undefined and nothing here can pass until builder-agents lands the second
 * stage of Decision 18. They are written against the contract rather than
 * against today's code on purpose: this is the case the contract change
 * exists for, and it had no coverage at all. The one that passes is the
 * premise, which has to hold whatever the code does.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLEAN_SERIAL, cleanPs5 } from "@pay-pals/contracts";
import type { ArrivalCheck, ItemCard, Photo } from "@pay-pals/contracts";
import { buildEvidencePack, createBuyerPal, createFixturePriceLookup } from "@pay-pals/agents";
import type { EvidenceInput } from "@pay-pals/contracts";
import { fakeVision } from "./fake-vision";
import { LOCAL_PHOTO_BASE, fileImageFetcher } from "./local-images";
import { driveTo, seedFixture } from "./seed";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
/** Any committed image will do: the fake answers whatever it is shown. The file only has to load. */
const SOME_PHOTO = resolve(REPO_ROOT, "assets", "demo-photos", "clean-ps5", "arrival-console-serial.jpg");
const PHOTO_URL = `${LOCAL_PHOTO_BASE}/arrival/photo-1.jpg`;

/** One of the three misreads measured on this label: the trailing 0 read as Q. */
const ONE_CHARACTER_OUT = "AJ16495258Q";
/** Not a misread of anything: a different unit. */
const A_DIFFERENT_SERIAL = "BX900000001";

/**
 * A caption that says nothing about a serial, so the only number in play is
 * the one the fake reads off the picture. A caption carrying a number would
 * give the comparison a typed side and change what is being tested.
 */
const arrivalPhoto: Photo = {
  url: PHOTO_URL,
  whatItShows: "The console that arrived, on a table.",
  addedBy: "buyer",
  addedAt: new Date().toISOString(),
};

const lockedCard: ItemCard = { ...cleanPs5.cards.at(-1)!, lockedAt: new Date().toISOString() };
const fetchLocalFile = fileImageFetcher({ [PHOTO_URL]: SOME_PHOTO });

/** The arrival check for a photo the pal "reads" the given serial off. */
async function checkWithVisionSerial(serial: string, card: ItemCard = lockedCard): Promise<ArrivalCheck> {
  const pal = createBuyerPal({
    anthropic: fakeVision({ brand: card.brand, model: card.model, serial, serial_on: "item", item_present: true }),
    priceLookup: createFixturePriceLookup(),
    fetchImage: fetchLocalFile,
  });
  const { data } = await pal.checkArrival(card, [arrivalPhoto]);
  return data;
}

/** The same arrival with no model at all, so the number can only come from the caption. */
async function checkWithTypedSerial(serial: string): Promise<ArrivalCheck> {
  const pal = createBuyerPal({ anthropic: null, priceLookup: createFixturePriceLookup() });
  const photo: Photo = { ...arrivalPhoto, url: "/fixtures/clean-ps5/arrival-console-serial.jpg", whatItShows: `The label on the console that arrived. The number under the barcode is ${serial}.` };
  const { data } = await pal.checkArrival(lockedCard, [photo]);
  return data;
}

describe("an arrival serial one character from the card", () => {
  it("has a photo to read, so the fake stands in for a model and not for a missing file", () => {
    expect(existsSync(SOME_PHOTO), `${SOME_PHOTO} is missing`).toBe(true);
    expect(readFileSync(SOME_PHOTO).byteLength).toBeGreaterThan(0);
    expect(lockedCard.serial, "the clean card carries the serial this band is measured against").toBe(CLEAN_SERIAL);
    expect(ONE_CHARACTER_OUT).not.toBe(CLEAN_SERIAL);
    expect(ONE_CHARACTER_OUT.length, "the band only applies from 8 characters up").toBeGreaterThanOrEqual(8);
  });

  it("is inconclusive, and what could not be settled is not filed as a difference", async () => {
    const check = await checkWithVisionSerial(ONE_CHARACTER_OUT);
    console.log(`near miss: outcome=${check.outcome} observed=${JSON.stringify(check.observed)}\n  unsettled: ${JSON.stringify(check.unsettled)}\n  pal: ${check.palMessage}`);

    expect(check.outcome).toBe("inconclusive");
    expect(check.mismatches, "an unsettled comparison is not a difference").toEqual([]);
    expect(check.unsettled ?? [], "inconclusive has to say what it could not settle").not.toEqual([]);
    expect(check.unsettled!.some((u) => u.field === "serial")).toBe(true);
    // The read came off the picture, which is the only reason the band applied at all.
    expect(check.observed.serialSource).toBe("photo");
  });

  it("does not invite a dispute, in the pal's message or in the pack built from it", async () => {
    const check = await checkWithVisionSerial(ONE_CHARACTER_OUT);
    expect(check.palMessage, "a misread character must not send a buyer to a dispute").not.toMatch(/dispute/i);

    const seeded = await seedFixture(cleanPs5);
    await driveTo(seeded, "AGREED");
    const input: EvidenceInput = {
      deal: (await seeded.store.getDeal(seeded.dealId))!,
      lockedCard,
      verdicts: [],
      arrivalCheck: { ...check, dealId: seeded.dealId },
      messages: await seeded.store.listMessages(seeded.dealId),
      payment: null,
      shipment: null,
      timeline: await seeded.store.listEvents(seeded.dealId),
      arrivalPhotos: [arrivalPhoto],
      requestedBy: "buyer",
    };
    const { data: pack, palMessage } = await buildEvidencePack(input, { anthropic: null });
    expect(`${pack.summary} ${palMessage}`, "the pack must not call an unsettled comparison a dispute").not.toMatch(/dispute/i);
  });

  it("names both numbers and claims neither outcome", async () => {
    const check = await checkWithVisionSerial(ONE_CHARACTER_OUT);
    expect(check.palMessage).toContain(CLEAN_SERIAL);
    expect(check.palMessage).toContain(ONE_CHARACTER_OUT);
    expect(check.palMessage, "it may not say the arrival matched").not.toMatch(/matches the locked card|What arrived matches/i);
    expect(check.palMessage, "and it may not say the arrival is the wrong item").not.toMatch(/not the item on the card|is not the item/i);
  });
});

describe("what the band must never swallow", () => {
  it("a genuinely different serial is still a mismatch", async () => {
    const check = await checkWithVisionSerial(A_DIFFERENT_SERIAL);
    console.log(`different serial: outcome=${check.outcome}\n  pal: ${check.palMessage}`);

    expect(check.outcome).toBe("mismatch");
    expect(check.unsettled ?? []).toEqual([]);
    expect(check.mismatches.some((m) => m.field === "serial" && m.observed.includes(A_DIFFERENT_SERIAL))).toBe(true);
    // The buyer is told plainly, and the pack is on the table.
    expect(check.palMessage).toMatch(/dispute/i);
  });

  it("does not apply when both numbers were typed rather than read off a picture", async () => {
    const check = await checkWithTypedSerial(ONE_CHARACTER_OUT);
    console.log(`typed, one character out: outcome=${check.outcome} source=${check.observed.serialSource}\n  pal: ${check.palMessage}`);

    expect(check.observed.serial, "the number came out of the caption").toBe(ONE_CHARACTER_OUT);
    expect(check.observed.serialSource).not.toBe("photo");
    expect(check.outcome, "two typed numbers that differ by one character differ for some other reason").toBe("mismatch");
    expect(check.unsettled ?? []).toEqual([]);
  });

  it("does not apply to a short identifier, where one edit is a large part of the number", async () => {
    // Seven characters, under the eight the band starts at.
    const shortCard: ItemCard = { ...lockedCard, serial: "AB12345", boxSerial: null };
    const check = await checkWithVisionSerial("AB12745", shortCard);
    console.log(`short identifier: outcome=${check.outcome}\n  pal: ${check.palMessage}`);

    expect(shortCard.serial!.length).toBeLessThan(8);
    expect(check.observed.serialSource).toBe("photo");
    expect(check.outcome, "one edit in seven characters is too large a share to call a misread").toBe("mismatch");
    expect(check.unsettled ?? []).toEqual([]);
  });
});
