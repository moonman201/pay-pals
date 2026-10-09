/**
 * BuyerPal.checkArrival: read the arrival photos, then compare what they show
 * to the locked card. The comparison itself is deterministic so no model can
 * talk a mismatch away. The rules:
 *   - the serial must be read off the item itself. A serial on a box label or
 *     any packaging never satisfies the item serial on the locked card;
 *   - a different item serial or model number means matches false;
 *   - when the photos show no item at all, that is one mismatch on "other":
 *     the card describes an item and the box arrived without it. There is
 *     nothing to read a serial from, and the number on the box label does
 *     not stand in for the item;
 *   - when something did arrive but no serial can be read off the item,
 *     matches is false on "serial". The expectation is the card's own serial,
 *     or the box label's number when the card never carried the item's.
 * The pal message always says what was looked at: the images themselves, or
 * the photo descriptions when an image could not be loaded.
 */
import type { ArrivalCheck, ItemCard, Mismatch, PalResult, Photo } from "@pay-pals/contracts";
import type { ClaudeClient } from "../claude/client";
import { sentences } from "../copy";
import { modelFamily, normalizeSerial } from "../vision/description";
import type { ImageFetcher } from "../vision/fetch-image";
import { describeLooking, itemMissing, itemSerial, packagingSerial, readPhotos, type PhotoReading } from "../vision/read-photo";

export interface ArrivalDeps {
  client: ClaudeClient | null;
  fetchImage?: ImageFetcher;
  photoBaseUrl?: string | null;
  /** Presentation only: drop the sentences about photo files that could not be loaded. */
  publicMode?: boolean;
}

export interface ArrivalEvidence {
  /** Serial read off a box label or packaging, if any. Never counts as the item serial. */
  packagingSerial: string | null;
  /** The photo that shows the item is not there, if any. */
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

  // An empty box is a missing item, not a serial that differs: there is nothing there to read a serial from,
  // so the card's own description is what the arrival contradicts. The number on the box label does not stand in.
  if (evidence.missing) {
    const caption = evidence.missing.photo.whatItShows;
    mismatches.push({
      field: "other",
      expected: card.title,
      observed: `nothing in the box but packaging: "${caption}"`,
      explanation: `The locked card describes ${card.title}, and the box arrived without it: "${caption}"`.slice(0, 300),
    });
    return mismatches;
  }

  // The number to match against is the one on the item when the card has it, otherwise the one off the box label.
  const expectedSerial = card.serial ?? card.boxSerial ?? null;
  const fromBoxLabel = !card.serial && card.boxSerial !== null && card.boxSerial !== undefined;
  const expectedLabel = expectedSerial !== null && fromBoxLabel ? `${expectedSerial} (box label; the card never carried the console's own serial)` : expectedSerial;

  if (expectedSerial && observed.serial && normalizeSerial(expectedSerial) !== normalizeSerial(observed.serial)) {
    mismatches.push({
      field: "serial",
      expected: expectedLabel!,
      observed: observed.serial,
      explanation: `The serial on the item that arrived is ${observed.serial}. The locked card says ${expectedSerial}. This is a different unit.`,
    });
  } else if (expectedSerial && !observed.serial && evidence.photosProvided) {
    const labelNote = evidence.packagingSerial ? ` The box label reads ${evidence.packagingSerial}, but a label is not the item and does not count.` : "";
    mismatches.push({
      field: "serial",
      expected: expectedLabel!,
      observed: "not readable in the arrival photos",
      explanation: `No serial could be read off the item itself, so it cannot be matched to ${expectedSerial}.${labelNote}`,
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

  return mismatches;
}

export async function checkArrivalAgainstCard(card: ItemCard, arrivalPhotos: Photo[], deps: ArrivalDeps): Promise<PalResult<ArrivalCheck>> {
  const readings = await readPhotos(arrivalPhotos, {
    client: deps.client,
    fetchImage: deps.fetchImage,
    photoBaseUrl: deps.photoBaseUrl,
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
  const differs = mismatches.some((m) => (m.field === "serial" && observed.serial !== null) || m.field === "model" || m.field === "brand");
  const unreadable = mismatches.some((m) => m.field === "serial") && observed.serial === null && !missing;

  const palMessage = sentences(
    arrivalPhotos.length === 0 ? "I have no arrival photos to check yet. Add a photo of the serial on the item itself." : null,
    describeLooking(readings, "arrival photo", deps.publicMode === true),
    matches && observed.serial ? `What arrived matches the locked card. Serial ${observed.serial} confirmed on the item itself.` : null,
    matches && !observed.serial && arrivalPhotos.length > 0 ? "Nothing contradicts the card, but the card has no serial to confirm." : null,
    missing ? `The box arrived without the item. The locked card describes ${card.title}, and there is no item in the photos.` : null,
    missing && box ? `The box label shows ${box.serial}, which does not count. A label is not the item.` : null,
    missing ? "I will build the evidence pack so you can open a PayPal dispute." : null,
    unreadable ? `I could not find a serial on the item itself, so I cannot confirm this is the unit on the card${box ? `. The box label shows ${box.serial}, which does not count` : ""}. Add a clear photo of the serial on the item.` : null,
    differs ? "This is not the item on the card." : null,
    differs
      ? mismatches
          .filter((m) => m.field === "serial" || m.field === "model" || m.field === "brand")
          .map((m) => `${m.field === "serial" ? "Serial" : m.field === "model" ? "Model" : "Brand"}: card says ${m.expected}, arrival shows ${m.observed}.`)
          .join(" ")
      : null,
    differs ? "I will build the evidence pack so you can open a PayPal dispute." : null,
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
