/**
 * BuyerPal.checkArrival: read the arrival photos, then compare what they show
 * to the locked card. The comparison itself is deterministic so no model can
 * talk a mismatch away. The rules:
 *   - the serial must be read off the item itself. A serial on a box label or
 *     any packaging never satisfies the item serial on the locked card;
 *   - a different item serial, model number or brand is a mismatch;
 *   - when the photos show no item at all, that is one mismatch on "other":
 *     the card describes an item and the box arrived without it. There is
 *     nothing to read a serial from, and the number on the box label does
 *     not stand in for the item;
 *   - two things are inconclusive rather than mismatches, because in neither
 *     case did anything actually differ: a serial one character off the card
 *     when the arrival number came off a photo, which is the shape of a
 *     misread, and a serial that could not be read at all. Both used to
 *     report a mismatch, which told the buyer the wrong item had arrived on
 *     no evidence whatever.
 *
 * The outcome is match, mismatch or inconclusive, and the two lists answer
 * different questions: `mismatches` is what differed, `unsettled` is what
 * could not be settled. An inconclusive arrival never invites a dispute.
 * The pal message always says what was looked at: the images themselves, or
 * the photo descriptions when an image could not be loaded. It also says
 * which of the two a serial came from. A number lifted out of the buyer's
 * caption is the buyer's word, which is evidence, but it is not something the
 * pal saw, so only a number read off the picture is called confirmed on the
 * item itself. In demo-only mode nothing is read, so that distinction is the
 * difference between an honest page and a claim with nothing behind it.
 */
import type { ArrivalCheck, ArrivalOutcome, ItemCard, Mismatch, PalResult, Photo } from "@pay-pals/contracts";
import type { ClaudeClient } from "../claude/client";
import { sentences } from "../copy";
import { modelFamily } from "../vision/description";
import { compareSerials, describeDifference } from "../vision/serial-match";
import type { ImageFetcher } from "../vision/fetch-image";
import { describeLooking, itemMissing, itemSerial, packagingSerial, readPhotos, type PhotoReading } from "../vision/read-photo";
import { arrivalReasoning } from "./arrival-reasons";
import { withoutCaptionsInObserved } from "./observed-guard";

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

/**
 * What the comparison found. The two lists answer different questions, which
 * is why they are not one list: `mismatches` is what positively differed, and
 * `unsettled` is what could not be settled either way. Calling the second one
 * a difference is the overclaim the three-value outcome exists to stop.
 */
export interface Comparison {
  mismatches: Mismatch[];
  unsettled: Mismatch[];
}

export function compareToCard(card: ItemCard, observed: ArrivalCheck["observed"], evidence: ArrivalEvidence): Comparison {
  const mismatches: Mismatch[] = [];
  const unsettled: Mismatch[] = [];

  // An empty box is a missing item, not a serial that differs: there is nothing there to read a serial from,
  // so the card's own description is what the arrival contradicts. The number on the box label does not stand in.
  // This is a difference the photos positively show, so it stays a mismatch.
  if (evidence.missing) {
    const caption = evidence.missing.photo.whatItShows;
    mismatches.push({
      field: "other",
      expected: card.title,
      // The caption stays out of this column: it is the buyer's word, and the column is what the
      // page renders as "arrived". See observed-guard.ts for the run where it leaked.
      observed: "no item in the box, only packaging",
      explanation: `The locked card describes ${card.title}, and the box arrived without it: "${caption}"`.slice(0, 300),
    });
    return { mismatches, unsettled };
  }

  // The number to match against is the one on the item when the card has it, otherwise the one off the box label.
  const expectedSerial = card.serial ?? card.boxSerial ?? null;
  const fromBoxLabel = !card.serial && card.boxSerial !== null && card.boxSerial !== undefined;
  const expectedLabel = expectedSerial !== null && fromBoxLabel ? `${expectedSerial} (box label; the card never carried the console's own serial)` : expectedSerial;

  if (expectedSerial && observed.serial) {
    // The band from the review side, with both its scoping conditions. serialSource tells us whether
    // the arrival number came off a picture, which is the only side that could have been misread here.
    const verdict = compareSerials(expectedSerial, observed.serial, { readFromPhoto: observed.serialSource === "photo" });
    if (verdict === "near") {
      unsettled.push({
        field: "serial",
        expected: expectedLabel!,
        observed: observed.serial,
        explanation:
          `I read ${observed.serial} off the item and the locked card says ${expectedSerial}: ${describeDifference(expectedSerial, observed.serial)}. ` +
          `One character apart is what a misread of a photo looks like, so this is more likely one number read twice than two different units. I cannot settle it from this photo.`.slice(0, 300),
      });
    } else if (verdict === "different") {
      mismatches.push({
        field: "serial",
        expected: expectedLabel!,
        observed: observed.serial,
        explanation: `The serial on the item that arrived is ${observed.serial}. The locked card says ${expectedSerial}. This is a different unit.`,
      });
    }
  } else if (expectedSerial && !observed.serial && evidence.photosProvided) {
    // Nothing differed here. A serial that could not be read is a comparison that did not happen,
    // and reporting it as a difference told the buyer the wrong item arrived on no evidence at all.
    const labelNote = evidence.packagingSerial ? ` The box label reads ${evidence.packagingSerial}, but a label is not the item and does not count.` : "";
    unsettled.push({
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

  return { mismatches, unsettled };
}

/**
 * The outcome from the two lists. A positive difference wins: when something
 * demonstrably differs, an unsettled comparison elsewhere does not soften it,
 * and the contract keeps `unsettled` for the inconclusive case only, so it is
 * dropped from the result. The pal's reasons still carry it.
 */
export function outcomeOf(comparison: Comparison): ArrivalOutcome {
  if (comparison.mismatches.length > 0) return "mismatch";
  return comparison.unsettled.length > 0 ? "inconclusive" : "match";
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
    // Published so apps/web reads the provenance rather than guessing at it. Null when there is
    // no serial at all, because then there is no source to name.
    serialSource: item ? (item.reading.source === "vision" ? ("photo" as const) : ("description" as const)) : null,
  };
  const raw = compareToCard(card, observed, { packagingSerial: box?.serial ?? null, missing, photosProvided: arrivalPhotos.length > 0 });
  // Nothing a caption said reaches the "arrived" column, whoever wrote the mismatch. See observed-guard.ts.
  const comparison = {
    mismatches: withoutCaptionsInObserved(raw.mismatches, arrivalPhotos),
    unsettled: withoutCaptionsInObserved(raw.unsettled, arrivalPhotos),
  };
  const outcome = outcomeOf(comparison);
  const { mismatches } = comparison;
  // Kept on the check only when the outcome is inconclusive, which is what the contract says.
  const unsettled = outcome === "inconclusive" ? comparison.unsettled : [];
  const matched = outcome === "match";
  const differs = mismatches.some((m) => (m.field === "serial" && observed.serial !== null) || m.field === "model" || m.field === "brand");
  // Two shapes of inconclusive, and they need different words: a number read that is one character
  // off the card, and no number readable at all.
  const nearMiss = unsettled.find((m) => m.field === "serial" && observed.serial !== null) ?? null;
  const unreadable = unsettled.some((m) => m.field === "serial") && observed.serial === null && !missing;
  // Where the number came from. A serial lifted out of the buyer's caption is the buyer's word: it is
  // evidence, but the pal did not see it, so it may not be called confirmed on the item itself.
  // observed.serialSource publishes the same fact, so the page says it too instead of guessing.
  const serialSeen = observed.serialSource === "photo";

  const palMessage = sentences(
    arrivalPhotos.length === 0 ? "I have no arrival photos to check yet. Add a photo of the serial on the item itself." : null,
    describeLooking(readings, "arrival photo", deps.publicMode === true),
    matched && observed.serial && serialSeen ? `What arrived matches the locked card. Serial ${observed.serial} confirmed on the item itself.` : null,
    matched && observed.serial && !serialSeen
      ? `Nothing contradicts the locked card. The serial ${observed.serial} comes from the description filed with the photo, not from the picture, so it is the buyer's word and not a number I read.`
      : null,
    matched && !observed.serial && arrivalPhotos.length > 0 ? "Nothing contradicts the card, but the card has no serial to confirm." : null,
    missing ? `The box arrived without the item. The locked card describes ${card.title}, and there is no item in the photos.` : null,
    missing && box ? `The box label shows ${box.serial}, which does not count. A label is not the item.` : null,
    missing ? "I will build the evidence pack. It is useful context if you open a PayPal dispute." : null,
    // Inconclusive says neither thing. It names both numbers, says which way the evidence leans, and
    // asks for the one photo that would settle it. It does not invite a dispute: there is nothing yet
    // to dispute, and sending a buyer to PayPal over a character that may have been misread is the
    // fault this outcome exists to stop.
    nearMiss
      ? `I cannot tell whether this is the unit on the card. I read ${observed.serial} off the item and the card says ${card.serial ?? card.boxSerial}, which is one character apart. That is what a misread of a photo looks like, so it is more likely one number read twice than two different consoles. Send a clearer close-up of the serial label and I will settle it. Do not open a dispute on this yet.`
      : null,
    unreadable
      ? `I could not find a serial on the item itself, so I cannot confirm this is the unit on the card${box ? `. The box label shows ${box.serial}, which does not count` : ""}. That is not the same as saying the wrong item arrived: I have nothing to compare. Add a clear photo of the serial on the item.`
      : null,
    differs ? "This is not the item on the card." : null,
    differs
      ? mismatches
          .filter((m) => m.field === "serial" || m.field === "model" || m.field === "brand")
          .map((m) => `${m.field === "serial" ? "Serial" : m.field === "model" ? "Model" : "Brand"}: card says ${m.expected}, arrival shows ${m.observed}.`)
          .join(" ")
      : null,
    differs ? "I will build the evidence pack. It is useful context if you open a PayPal dispute." : null,
  );

  const check: ArrivalCheck = {
    dealId: card.dealId,
    cardVersion: card.version,
    outcome,
    mismatches,
    ...(unsettled.length > 0 ? { unsettled } : {}),
    observed,
    palMessage,
    reasoning: arrivalReasoning({ card, readings, observed, mismatches, unsettled, missing }),
    createdAt: new Date().toISOString(),
  };
  return { data: check, palMessage };
}
