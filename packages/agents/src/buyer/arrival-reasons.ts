/**
 * The Buyer Pal's reasons for an arrival check. Same four groups as a review,
 * built from the same readings the comparison itself used, so the reasons and
 * the verdict cannot drift apart.
 *
 * The arrival check has no model in the loop at all: the comparison in
 * arrival.ts is deterministic on purpose, so nothing can talk a mismatch away.
 * These reasons are deterministic for the same reason.
 */
import type { ArrivalCheck, ItemCard, Mismatch, PalReasoning } from "@pay-pals/contracts";
import { itemSerial, packagingSerial, type PhotoReading } from "../vision/read-photo";
import { tidyReasons, type ReasonLine } from "./reasoning";

export interface ArrivalReasonInput {
  card: ItemCard;
  readings: PhotoReading[];
  observed: ArrivalCheck["observed"];
  mismatches: Mismatch[];
  /** The photo that shows the item is not in the box, if any. */
  missing: PhotoReading | null;
}

export function arrivalReasoning(input: ArrivalReasonInput): PalReasoning {
  const { card, readings, observed, mismatches, missing } = input;
  const read = readings.filter((r) => r.imageStatus === "read").length;
  const expected = card.serial ?? card.boxSerial ?? null;
  const box = packagingSerial(readings);
  const unreadable = itemSerial(readings) ? null : (readings.find((r) => r.serialIllegible) ?? null);

  const checked: ReasonLine[] = [];
  if (readings.length === 0) {
    checked.push("Nothing yet. No arrival photos have been added.");
  } else {
    checked.push(
      read > 0
        ? `The ${read === readings.length ? (read === 1 ? "arrival photo" : `${read} arrival photos`) : `${read} of the ${readings.length} arrival photos`}, against the locked card, version ${card.version}.`
        : `The captions on the ${readings.length === 1 ? "arrival photo" : `${readings.length} arrival photos`}, against the locked card, version ${card.version}.`,
    );
    if (expected) checked.push(`The serial on the item that arrived, against ${expected}${card.serial ? " on the locked card" : " from the box label, which is the only number the card ever carried"}.`);
    checked.push(`What the photos show, against the item the card describes: ${card.title}.`);
  }

  const found: ReasonLine[] = [];
  if (missing) found.push("The box arrived with packing inside it and nothing else. The item the card describes is not in the photos.");
  if (observed.serial) found.push(`The serial on the item that arrived reads ${observed.serial}.`);
  if (box) found.push(`The box label reads ${box.serial}. A label is not the item, so it does not settle which unit was inside.`);
  for (const mismatch of mismatches) found.push(mismatch.explanation);
  if (mismatches.length === 0 && readings.length > 0) {
    found.push(observed.serial ? "Nothing about what arrived contradicts the locked card." : "Nothing about what arrived contradicts the locked card, and the card had no serial of its own to confirm.");
  }

  const couldNotVerify: ReasonLine[] = [];
  if (readings.length === 0) {
    couldNotVerify.push("I have no arrival photos, so I could not check anything about what turned up.");
  } else {
    if (read === 0) {
      couldNotVerify.push(
        readings.length === 1
          ? "I did not read the photo file itself, so what it shows is the buyer's description rather than something I looked at."
          : `I did not read the ${readings.length} photo files themselves, so what they show is the buyer's description rather than something I looked at.`,
      );
    }
    else if (read < readings.length) couldNotVerify.push(`I could not read ${readings.length - read} of the ${readings.length} arrival photos, so for those I have only the caption.`);
    if (unreadable) couldNotVerify.push(`A serial is in one of the photos but I could not read it, because ${unreadable.serialIllegibleReason}. I have no number off the item itself.`);
    else if (!observed.serial && !missing) couldNotVerify.push("I found no serial on the item in these photos, so I cannot say this is the same unit the card describes.");
    if (missing) couldNotVerify.push("With no item in the box there is nothing to read a serial from, so I cannot say what was shipped or when it left.");
    if (!card.serial && card.boxSerial) couldNotVerify.push("The card never carried the console's own serial, only the box label's number, so an exact match on the item was never available to me.");
  }
  couldNotVerify.push("I can say what the photos show. I cannot say who packed the box or what happened to it on the way.");

  const wouldChangeMyMind: ReasonLine[] = [];
  if (missing) {
    wouldChangeMyMind.push("A photo of the item itself, with its serial readable, would change this.");
    wouldChangeMyMind.push("A second parcel arriving with the console in it would change this.");
  } else if (!observed.serial && readings.length > 0) {
    wouldChangeMyMind.push("A close-up of the serial label on the item that arrived would change this, because then there is a number to match.");
  } else if (mismatches.length > 0) {
    wouldChangeMyMind.push("A clearer photo of the same label, showing the number I read was wrong, would change this.");
  } else if (readings.length > 0) {
    wouldChangeMyMind.push("A different serial on a clearer photo of the same item would change this.");
  } else {
    wouldChangeMyMind.push("Adding a photo of the serial on the item that arrived would let me check this at all.");
  }

  return {
    checked: tidyReasons(checked),
    found: tidyReasons(found),
    couldNotVerify: tidyReasons(couldNotVerify),
    wouldChangeMyMind: tidyReasons(wouldChangeMyMind),
  };
}
