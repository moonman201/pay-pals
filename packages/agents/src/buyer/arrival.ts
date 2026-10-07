/**
 * BuyerPal.checkArrival: read the arrival photos, then compare what they show
 * to the locked card. The comparison itself is deterministic so no model can
 * talk a mismatch away. The rules:
 *   - the serial must be read off the item itself. A serial on a box label or
 *     any packaging never satisfies the item serial on the locked card;
 *   - a different item serial or model number means matches false;
 *   - when the card has a serial and none can be read off the item, matches
 *     is false. If the photos say the item is not there, the serial mismatch
 *     reads "not present" and a second mismatch on "other" quotes the photo.
 */
import type { ArrivalCheck, ItemCard, Mismatch, PalResult, Photo } from "@pay-pals/contracts";
import type { ClaudeClient } from "../claude/client";
import { sentences } from "../copy";
import { modelFamily, normalizeSerial } from "../vision/description";
import type { ImageFetcher } from "../vision/fetch-image";
import { itemMissing, itemSerial, packagingSerial, readPhotos, type PhotoReading } from "../vision/read-photo";

export interface ArrivalDeps {
  client: ClaudeClient | null;
  fetchImage?: ImageFetcher;
}

export interface ArrivalEvidence {
  /** Serial read off a box label or packaging, if any. Never counts as the item serial. */
  packagingSerial: string | null;
  /** The photo that says the item is not there, if any. */
  missing: PhotoReading | null;
  photosProvided: boolean;
}

function first<T>(readings: PhotoReading[], pick: (r: PhotoReading) => T | null): T | null {
  for (const reading of readings) {
    const value = pick(reading);
    if (value) return value;
  }
  return null;
}

export function compareToCard(card: ItemCard, observed: ArrivalCheck["observed"], evidence: ArrivalEvidence): Mismatch[] {
  const mismatches: Mismatch[] = [];

  if (card.serial && observed.serial && normalizeSerial(card.serial) !== normalizeSerial(observed.serial)) {
    mismatches.push({
      field: "serial",
      expected: card.serial,
      observed: observed.serial,
      explanation: `The serial on the item that arrived is ${observed.serial}. The locked card says ${card.serial}. This is a different unit.`,
    });
  } else if (card.serial && !observed.serial && evidence.photosProvided) {
    const labelNote = evidence.packagingSerial ? ` The box label reads ${evidence.packagingSerial}, but a label is not the item and does not count.` : "";
    mismatches.push({
      field: "serial",
      expected: card.serial,
      observed: evidence.missing ? "not present, box arrived empty" : "not readable in the arrival photos",
      explanation: evidence.missing
        ? `The photos show the item is not there, so there is no serial to compare against ${card.serial}.${labelNote}`
        : `No serial could be read off the item itself, so it cannot be matched to ${card.serial}.${labelNote}`,
    });
  }

  const expectedFamily = modelFamily(card.model);
  const observedFamily = observed.model ? modelFamily(observed.model) : null;
  if (
    expectedFamily &&
    observedFamily &&
    expectedFamily.family.toLowerCase() === observedFamily.family.toLowerCase() &&
    expectedFamily.number !== observedFamily.number
  ) {
    mismatches.push({
      field: "model",
      expected: card.model,
      observed: observed.model!,
      explanation: `The item that arrived reads ${observed.model}. The locked card says ${card.model}.`,
    });
  }

  if (observed.brand && observed.brand.trim().toLowerCase() !== card.brand.trim().toLowerCase()) {
    mismatches.push({
      field: "brand",
      expected: card.brand,
      observed: observed.brand,
      explanation: `The item that arrived is branded ${observed.brand}. The locked card says ${card.brand}.`,
    });
  }

  if (evidence.missing) {
    mismatches.push({
      field: "other",
      expected: `${card.title} in the box`,
      observed: `"${evidence.missing.photo.whatItShows}"`,
      explanation: "The arrival photo says the item was not in the box.",
    });
  }

  return mismatches;
}

export async function checkArrivalAgainstCard(card: ItemCard, arrivalPhotos: Photo[], deps: ArrivalDeps): Promise<PalResult<ArrivalCheck>> {
  const readings = await readPhotos(arrivalPhotos, {
    client: deps.client,
    fetchImage: deps.fetchImage,
    hints: { brand: card.brand, model: card.model },
  });
  const item = itemSerial(readings);
  const box = packagingSerial(readings);
  const missing = itemMissing(readings);
  const observed = {
    brand: first(readings, (r) => r.brand),
    model: first(readings, (r) => r.model),
    serial: item?.serial ?? null,
  };
  const mismatches = compareToCard(card, observed, { packagingSerial: box?.serial ?? null, missing, photosProvided: arrivalPhotos.length > 0 });
  const matches = mismatches.length === 0;
  const usedDescriptions = readings.length > 0 && readings.every((r) => r.source === "description");
  const serialDiffers = mismatches.some((m) => m.field === "serial" && observed.serial !== null);
  const unreadable = mismatches.some((m) => m.field === "serial") && observed.serial === null && !missing;

  const palMessage = sentences(
    arrivalPhotos.length === 0 ? "I have no arrival photos to check yet. Add a photo of the serial on the item itself." : null,
    matches && observed.serial ? `What arrived matches the locked card. Serial ${observed.serial} confirmed on the item itself.` : null,
    matches && !observed.serial && arrivalPhotos.length > 0 ? "The photos show nothing that contradicts the card, but the card has no serial to confirm." : null,
    missing ? `The box arrived without the item. The locked card says serial ${card.serial ?? "unknown"} and the photos show nothing to read it from.` : null,
    missing && box ? `The box label shows ${box.serial}, which does not count. A label is not the item.` : null,
    missing ? "I will build the evidence pack so you can open a PayPal dispute." : null,
    unreadable ? "I could not read a serial on the item itself, so I cannot confirm this is the unit on the card. Add a clear photo of the serial on the item. A box label does not count." : null,
    serialDiffers || mismatches.some((m) => m.field === "model" || m.field === "brand") ? "This is not the item on the card." : null,
    serialDiffers || mismatches.some((m) => m.field === "model" || m.field === "brand")
      ? mismatches
          .filter((m) => m.field === "serial" || m.field === "model" || m.field === "brand")
          .map((m) => `${m.field === "serial" ? "Serial" : m.field === "model" ? "Model" : "Brand"}: card says ${m.expected}, arrival shows ${m.observed}.`)
          .join(" ")
      : null,
    serialDiffers || mismatches.some((m) => m.field === "model" || m.field === "brand") ? "I will build the evidence pack so you can open a PayPal dispute." : null,
    usedDescriptions ? "I could not open the photo files, so I went by the photo descriptions." : null,
  );

  const check: ArrivalCheck = {
    dealId: card.dealId,
    cardVersion: card.version,
    matches,
    mismatches,
    observed,
    palMessage,
    createdAt: new Date().toISOString(),
  };
  return { data: check, palMessage };
}
