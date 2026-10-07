/**
 * BuyerPal.checkArrival: read the arrival photos, then compare what they show
 * to the locked card. The comparison itself is deterministic so no model can
 * talk a mismatch away. A different serial or a different model number means
 * matches false.
 */
import type { ArrivalCheck, ItemCard, Mismatch, PalResult, Photo } from "@pay-pals/contracts";
import type { ClaudeClient } from "../claude/client";
import { sentences } from "../copy";
import { modelFamily, normalizeSerial } from "../vision/description";
import type { ImageFetcher } from "../vision/fetch-image";
import { readPhotos, type PhotoReading } from "../vision/read-photo";

export interface ArrivalDeps {
  client: ClaudeClient | null;
  fetchImage?: ImageFetcher;
}

function first<T>(readings: PhotoReading[], pick: (r: PhotoReading) => T | null): T | null {
  for (const reading of readings) {
    const value = pick(reading);
    if (value) return value;
  }
  return null;
}

export function compareToCard(card: ItemCard, observed: ArrivalCheck["observed"]): Mismatch[] {
  const mismatches: Mismatch[] = [];

  if (card.serial && observed.serial && normalizeSerial(card.serial) !== normalizeSerial(observed.serial)) {
    mismatches.push({
      field: "serial",
      expected: card.serial,
      observed: observed.serial,
      explanation: `The serial on the item that arrived is ${observed.serial}. The locked card says ${card.serial}. This is a different unit.`,
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
    hints: { brand: card.brand, model: card.model },
  });
  const observed = {
    brand: first(readings, (r) => r.brand),
    model: first(readings, (r) => r.model),
    serial: first(readings, (r) => r.serial),
  };
  const mismatches = compareToCard(card, observed);
  const matches = mismatches.length === 0;
  const usedDescriptions = readings.length > 0 && readings.every((r) => r.source === "description");

  const palMessage = sentences(
    arrivalPhotos.length === 0 ? "I have no arrival photos to check yet. Add a photo of the back of the item showing the serial." : null,
    matches && observed.serial ? `What arrived matches the locked card. Serial ${observed.serial} confirmed.` : null,
    matches && !observed.serial && arrivalPhotos.length > 0
      ? "I could not read a serial from the arrival photos, so I cannot confirm this is the same unit. Add a clear photo of the serial."
      : null,
    !matches ? "This is not the item on the card." : null,
    !matches ? mismatches.map((m) => `${m.field === "serial" ? "Serial" : m.field === "model" ? "Model" : "Brand"}: card says ${m.expected}, arrival shows ${m.observed}.`).join(" ") : null,
    !matches ? "I will build the evidence pack so you can open a PayPal dispute." : null,
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
