/**
 * The Buyer Pal's reasons for a review, worked out from the rules and the
 * lookups alone, so they are there with or without a model.
 *
 * Two things this file is strict about.
 *
 * `checked` names what was looked at and what it was compared against. "The
 * serial on the card, against the number on the box label" is a reason. "The
 * serial" is not, because it does not say what would have counted as wrong.
 *
 * `couldNotVerify` is the group a pal is tempted to leave out, so everything
 * the review already knows it does not know ends up here: a photo file nobody
 * read, a serial that was in a picture and could not be read, a cert record
 * that is the demo stand-in rather than PSA, a market range that never came
 * back. The code that knows those things is the same code that writes the
 * guarded pal message; this is where it stops being dropped on the floor.
 *
 * `wouldChangeMyMind` is built from the same two helpers that build the
 * questions for the seller (proof-question.ts), so the pal never asks for a
 * close-up in one panel while saying a close-up would not help in another.
 */
import type { CertCheck, ItemCard, Party, PriceCheck, RedFlag, VerdictOverall } from "@pay-pals/contracts";
import { PAYMENT_METHOD_FLAGS } from "@pay-pals/contracts";
import { deviceFamily } from "../seller/listing-parse";
import { normalizeSerial } from "../vision/description";
import { compareSerials, describeDifference } from "../vision/serial-match";
import { itemSerial, type PhotoReading } from "../vision/read-photo";
import { datedNoteQuestion, serialCloseUpQuestion } from "./proof-question";
import { tidyReasons, type ReasonLine } from "./reasoning";
import type { PalReasoning } from "@pay-pals/contracts";

/**
 * The card's two serials when they are one edit apart and a photo read is in
 * play, so neither "they match" nor "they differ" is honest. Null otherwise.
 * See serial-match.ts.
 */
export function nearMissSerials(card: ItemCard | null, serialReadFromPhoto: boolean): { serial: string; boxSerial: string; where: string } | null {
  if (!card?.serial || !card.boxSerial) return null;
  if (compareSerials(card.serial, card.boxSerial, { readFromPhoto: serialReadFromPhoto }) !== "near") return null;
  return { serial: card.serial, boxSerial: card.boxSerial, where: describeDifference(card.serial, card.boxSerial) };
}

export interface ReviewReasonInput {
  card: ItemCard | null;
  priceCheck: PriceCheck | null;
  certCheck: CertCheck | null;
  certLookupFailed: boolean;
  readings: PhotoReading[];
  flags: RedFlag[];
  overall: VerdictOverall;
  seller: Pick<Party, "displayName" | "email"> | null;
  /** True when the card's photos were compared against a set of known listing photos. */
  photoMatchRan: boolean;
  /** False when no Claude client was available, so the review is rules only. */
  modelAvailable: boolean;
  /** True when a serial was read off one of the card's photos, so the near-miss band applies. */
  serialReadFromPhoto: boolean;
}

const has = (flags: readonly RedFlag[], code: RedFlag["code"]): boolean => flags.some((f) => f.code === code);

/** The serial that is in a photo and could not be read, with the model's reason. Null when a serial was read off the item. */
function unreadableSerial(readings: PhotoReading[]): PhotoReading | null {
  if (itemSerial(readings)) return null;
  return readings.find((r) => r.serialIllegible) ?? null;
}

function checked(input: ReviewReasonInput): ReasonLine[] {
  const { card, priceCheck, certCheck, readings, seller } = input;
  const read = readings.filter((r) => r.imageStatus === "read").length;
  const lines: ReasonLine[] = [
    "Every message in the shared chat, against the payment, pressure and off-platform patterns Pay Pals checks for.",
  ];
  if (!card) return lines;
  if (read > 0) {
    lines.push(
      read === readings.length
        ? `The ${read === 1 ? "photo" : `${read} photos`} on the card, against the brand, model and serial the card claims.`
        : `${read} of the ${readings.length} photos on the card, against the brand, model and serial the card claims.`,
    );
  }
  if (priceCheck && priceCheck.marketLow > 0) {
    lines.push(`The asking price of $${card.askingPrice}, against a market range of $${priceCheck.marketLow} to $${priceCheck.marketHigh} for this item in this condition.`);
  }
  if (certCheck) {
    lines.push(`Cert ${certCheck.record.certNumber} on the card, against the ${certCheck.record.provider === "psa" ? "grader's record" : "demo record standing in for the grader"} for that number.`);
  }
  if (card.serial && card.boxSerial) {
    lines.push(`The serial on the card, ${card.serial}, against the number on the box label, ${card.boxSerial}.`);
  }
  if (seller?.displayName) {
    // "Matt M." already ends in a stop, and one serves both the abbreviation and the sentence.
    lines.push(`The PayPal address on the card, ${card.sellerPaypalEmail}, against the seller's name on the deal, ${seller.displayName.replace(/\.$/, "")}.`);
  }
  if (input.photoMatchRan) {
    lines.push("The card's photos, against the reference pictures Pay Pals holds, to see whether any of them is a picture Pay Pals has already seen.");
  }
  return lines;
}

function found(input: ReviewReasonInput): ReasonLine[] {
  const { card, priceCheck, certCheck, readings, flags } = input;
  const lines: ReasonLine[] = [];
  // The flags come first: they are what the verdict turns on, and their wording is already the plain one the buyer reads.
  for (const flag of flags) lines.push(flag.explanation);
  if (flags.length === 0) lines.push("Nothing in the chat matched a pattern Pay Pals checks for.");
  if (card && priceCheck && priceCheck.marketLow > 0 && !has(flags, "PRICE_FAR_BELOW_MARKET")) {
    lines.push(
      card.askingPrice > priceCheck.marketHigh
        ? `The $${card.askingPrice} ask is above the $${priceCheck.marketLow} to $${priceCheck.marketHigh} range.`
        : `The $${card.askingPrice} ask sits inside the $${priceCheck.marketLow} to $${priceCheck.marketHigh} range.`,
    );
  }
  const item = itemSerial(readings);
  if (item) lines.push(`I read ${item.serial} off the item itself in one of the photos.`);
  if (card?.serial && card.boxSerial && normalizeSerial(card.serial) === normalizeSerial(card.boxSerial)) {
    lines.push(`The serial on the card and the number on the box label are the same, ${card.serial}.`);
  }
  const near = nearMissSerials(card, input.serialReadFromPhoto);
  if (near) lines.push(`The serial on the card is ${near.serial} and the number read off the box label is ${near.boxSerial}: ${near.where}.`);
  if (certCheck && certCheck.matches !== null) lines.push(certCheck.explanation);
  return lines;
}

function couldNotVerify(input: ReviewReasonInput): ReasonLine[] {
  const { card, priceCheck, certCheck, certLookupFailed, readings, flags } = input;
  const lines: ReasonLine[] = [];
  if (!card) {
    lines.push("There is no item card yet, so I could not check the price, the serial, the photos or a grading cert.");
    lines.push("I have only the chat. Anything the seller has not written down is not something I can speak to.");
    return lines;
  }
  if (!input.modelAvailable) lines.push("No model was available for this review, so the rules are all that ran.");

  // The denominator is what the card carries, not what came back from the reader. With no model there are no
  // readings at all, and saying the card has no photos when it has four would be exactly the kind of quiet
  // untruth this group exists to stop.
  const photos = card.photos.length;
  const read = readings.filter((r) => r.imageStatus === "read").length;
  if (photos === 0) {
    lines.push("The card has no photos, so there was nothing for me to look at.");
  } else if (read === 0) {
    lines.push(
      photos === 1
        ? "I did not read the photo file itself, so what it shows is the seller's description rather than something I looked at."
        : `I did not read the ${photos} photo files themselves, so what they show is the seller's description rather than something I looked at.`,
    );
  } else if (read < photos) {
    lines.push(`I could not read ${photos - read} of the ${photos} photos, so for those I have only the seller's caption.`);
  }

  // Item 2's consequence: a serial that is in the picture and unreadable is a thing we do not know, not a thing to skip over.
  const unreadable = unreadableSerial(readings);
  if (unreadable) {
    lines.push(`A serial is in one of the photos but I could not read it, because ${unreadable.serialIllegibleReason}. I have no number off the item itself.`);
  }
  if (card.boxSerial && !card.serial) {
    lines.push("The number I have is on the box label. A box is not the console, so it does not show which unit is inside.");
  }
  // The near-miss band claims neither a match nor a mismatch, so the thing it could not settle has
  // to be said out loud. Dropping the flag and saying nothing would be the quiet kind of untruth.
  const near = nearMissSerials(card, input.serialReadFromPhoto);
  if (near) {
    lines.push(`I cannot tell whether ${near.serial} and ${near.boxSerial} are the same number: ${near.where}, which is what a misread of one character looks like. I am not calling that a match and I am not calling it a mismatch.`);
  }

  if (certLookupFailed && card.certNumber) lines.push(`I could not reach the grader to check cert ${card.certNumber}, so that check did not happen.`);
  if (certCheck?.record.provider === "fixture") lines.push("The cert record behind that check is a demo record standing in for the grader, not a live lookup.");
  if (certCheck?.matches === true) lines.push("A record that matches shows the grader has one for that number. It does not show that this seller is holding the slab.");

  if (!priceCheck || priceCheck.marketLow <= 0) {
    lines.push(`No market price came back for this item, so I could not compare the $${card.askingPrice} ask against anything.`);
  } else if (priceCheck.provider === "fixture") {
    lines.push("The market range is a reference range for this demo, not a live quote.");
  }

  // The limit on the picture check, which until now was never stated. Pay Pals compares against a
  // set it holds; it does not search the web, and a reader who is not told that will assume the
  // stronger check happened. Decision 20.
  if (photos > 0) {
    lines.push(
      input.photoMatchRan
        ? "I compared these pictures against Pay Pals' own set only. I did not search the web, so I cannot say whether any of them appears on a listing somewhere else."
        : "I did not compare these pictures against the set Pay Pals holds, so I cannot say whether any of them is one it has seen before.",
    );
  }
  if (!has(flags, "NAME_MISMATCH") && !input.seller) {
    lines.push("I was not given the seller's name on the account, so I could not check it against the PayPal address on the card.");
  }
  // Last, because it is true of every deal and should never push a specific gap out of the list.
  lines.push("Nothing here shows who is holding the item. A number that matches supports what the listing says and no more.");
  return lines;
}

function wouldChangeMyMind(input: ReviewReasonInput): ReasonLine[] {
  const { card, flags, overall } = input;
  const lines: ReasonLine[] = [];
  if (flags.some((f) => PAYMENT_METHOD_FLAGS.includes(f.code))) {
    lines.push("A Goods and Services checkout would change this. Nothing else will, because that is the only way Pay Pals pays.");
  }
  if (has(flags, "PRICE_FAR_BELOW_MARKET")) lines.push("A plain reason for the price, with a receipt or proof of purchase, would change this.");
  if (has(flags, "STOCK_OR_REUSED_PHOTO")) lines.push("A photo of the item in the seller's own hands, taken today, would change this.");
  if (has(flags, "CERT_MISMATCH")) lines.push("A clear photo of the whole grading label, so I can read the cert number and the subject on it, would change this.");
  if (has(flags, "URGENCY_PRESSURE")) lines.push("The seller agreeing to wait until these checks are done would change this.");
  if (has(flags, "NAME_MISMATCH")) lines.push("An explanation of why the PayPal name is not the seller's name, or a payment to an address that matches, would change this.");
  if (has(flags, "SHIP_BEFORE_PAY_TRICK")) lines.push("The seller shipping only after the Goods and Services payment is captured would change this.");

  // The same asks the seller gets, worded as what they would settle, so the panels agree.
  if (nearMissSerials(card, input.serialReadFromPhoto)) {
    lines.push("A clearer photo of the box label would settle whether those two numbers are the same, because one of the two was read off a picture and could be a character out.");
  }
  if (datedNoteQuestion(card)) lines.push("One photo of the slab next to a handwritten note with the seller's name and today's date would show who is holding it.");
  const closeUp = serialCloseUpQuestion(card);
  if (closeUp) {
    const family = card ? deviceFamily(`${card.brand} ${card.model} ${card.title}`) : null;
    lines.push(`A close-up of the serial label on the ${family === "console" ? "console" : "device"} itself would give me a number to match against the card and against whatever arrives.`);
  }
  if (card && !card.serial && !closeUp && has(flags, "MISSING_SERIAL")) {
    lines.push("A serial number for the item itself would change this, so there is something to match when it arrives.");
  }
  if (overall === "go" && lines.length === 0) {
    lines.push("Anything that pushes you to pay another way, or to pay before these checks are done, would change this.");
  }
  if (!card) lines.push("The seller filling in an item card would change this, because then there is a price, a serial and photos to check.");
  return lines;
}

/** All four groups, from the rules and the lookups alone. */
export function reviewReasoning(input: ReviewReasonInput): PalReasoning {
  return {
    checked: tidyReasons(checked(input)),
    found: tidyReasons(found(input)),
    couldNotVerify: tidyReasons(couldNotVerify(input)),
    wouldChangeMyMind: tidyReasons(wouldChangeMyMind(input)),
  };
}
