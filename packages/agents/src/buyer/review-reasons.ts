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
  // One short line each, no lead-in sentence. Each still names the other side of the comparison,
  // because "the serial" is not a check and "the serial against the box label" is.
  const lines: ReasonLine[] = ["The chat, against the payment and pressure patterns we know."];
  if (!card) return lines;
  if (read > 0) lines.push(`${read === readings.length ? "The" : `${read} of the ${readings.length}`} card photo${readings.length === 1 ? "" : "s"}, against the brand, model and serial on the card.`);
  if (priceCheck && priceCheck.marketLow > 0) lines.push(`The $${card.askingPrice} price, against $${priceCheck.marketLow} to $${priceCheck.marketHigh} for this item.`);
  if (certCheck) lines.push(`Cert ${certCheck.record.certNumber}, against the ${certCheck.record.provider === "psa" ? "grader's record" : "stand-in record we hold"}.`);
  if (card.serial && card.boxSerial) lines.push(`The serial ${card.serial}, against ${card.boxSerial} on the box label.`);
  // "Matt M." already ends in a stop, and one serves both the abbreviation and the sentence.
  if (seller?.displayName) lines.push(`${card.sellerPaypalEmail}, against the seller's name, ${seller.displayName.replace(/\.$/, "")}.`);
  if (input.photoMatchRan) lines.push("The card photos, against the listing photos already on file.");
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
  // The PayPal-address check reported nothing when it passed, so a check that ran had no result
  // anywhere. It says what it actually tested: the name is in the address, not that the account
  // belongs to him, which nothing here can establish.
  if (card && input.seller?.displayName && !has(flags, "NAME_MISMATCH")) {
    lines.push(`The PayPal address that gets paid has the seller's name in it.`);
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
    lines.push(`A serial is in one photo but I could not read it: ${unreadable.serialIllegibleReason}.`);
  }
  if (card.boxSerial && !card.serial) {
    lines.push("The only serial is on the box label, which does not say which console is inside.");
  }
  // The near-miss band claims neither a match nor a mismatch, so the thing it could not settle has
  // to be said out loud. Dropping the flag and saying nothing would be the quiet kind of untruth.
  const near = nearMissSerials(card, input.serialReadFromPhoto);
  if (near) {
    lines.push(`I cannot tell whether ${near.serial} and ${near.boxSerial} are the same number: ${near.where}, which is what a misread of one character looks like. I am not calling that a match and I am not calling it a mismatch.`);
  }

  if (certLookupFailed && card.certNumber) lines.push(`I could not reach the grader to check cert ${card.certNumber}, so that check did not happen.`);
  // A cert that was not checked says so here. Its explanation used to ride in the pal's paragraph,
  // and when the paragraph went it would have gone silent, which is the exact failure this group exists for.
  if (certCheck?.matches === null) lines.push(certCheck.explanation);

  // One line for stand-in data, not one per source. The cert record and the price range were two
  // sentences saying the same thing, which is rule 1 broken inside a single group.
  const demoCert = certCheck?.record.provider === "fixture";
  const demoPrice = priceCheck !== null && priceCheck.marketLow > 0 && priceCheck.provider === "fixture";
  if (demoCert && demoPrice) lines.push("The cert record and the price range are both stand-ins for this demo, not live lookups.");
  else if (demoCert) lines.push("The cert record is a stand-in for this demo, not a live lookup.");
  else if (demoPrice) lines.push("The price range is a stand-in for this demo, not a live quote.");

  if (!priceCheck || priceCheck.marketLow <= 0) {
    lines.push(
      card.certNumber
        ? "No price check for a graded card. Our price source covers retail stores, not graded cards."
        : `No market price came back, so there is nothing to compare the $${card.askingPrice} price against.`,
    );
  }

  // The limit on the picture check, which until now was never stated. Pay Pals compares against a
  // set it holds; it does not search the web, and a reader who is not told that will assume the
  // stronger check happened. Decision 20.
  if (photos > 0) {
    lines.push(
      input.photoMatchRan
        ? "Photos are matched against our own file only, never the web."
        : "The photos were not matched against our file, so nothing was compared.",
    );
  }
  if (!has(flags, "NAME_MISMATCH") && !input.seller) {
    lines.push("I had no seller name to check the PayPal address against.");
  }
  // One ownership line, not two. The cert version of this said the same thing in different words,
  // so the specific one is used where there is a cert and the general one everywhere else.
  // Only where nothing else on the page already carries it. With a matching cert the deal page
  // puts "The slab exists. That doesn't prove he has it." directly above the cert comparison,
  // which is this fact sitting next to the thing it qualifies. Repeating it here would be the
  // same sentence twice in different words, which is rule 1 inside one group.
  if (certCheck?.matches !== true) lines.push("Nothing here shows who is holding the item.");
  return lines;
}

/**
 * Phrased as conditions, not as sentences, because the first two of these are
 * read straight into one line: "I'd look again if he sends the slab next to
 * his name and today's date, and agrees to Goods and Services." Each item has
 * to survive being dropped in after "if", so none of them ends in "would
 * change this" any more.
 *
 * Artefacts come before behaviour. What the seller can photograph or send is
 * the thing a buyer can act on today, and it is what Matt's own example leads
 * with; agreeing to Goods and Services closes the line rather than opening it.
 */
function wouldChangeMyMind(input: ReviewReasonInput): ReasonLine[] {
  const { card, flags, overall } = input;
  const artefacts: ReasonLine[] = [];
  const behaviour: ReasonLine[] = [];

  if (datedNoteQuestion(card)) artefacts.push("he sends the slab next to his name and today's date");
  const closeUp = serialCloseUpQuestion(card);
  if (closeUp) {
    const family = card ? deviceFamily(`${card.brand} ${card.model} ${card.title}`) : null;
    artefacts.push(`he sends a close-up of the serial label on the ${family === "console" ? "console" : "device"}`);
  }
  if (nearMissSerials(card, input.serialReadFromPhoto)) artefacts.push("he sends a clearer photo of the box label");
  if (has(flags, "STOCK_OR_REUSED_PHOTO")) artefacts.push("he sends a photo of the item in his own hands, taken today");
  if (has(flags, "CERT_MISMATCH")) artefacts.push("he sends a clear photo of the whole grading label");
  if (has(flags, "PRICE_FAR_BELOW_MARKET")) artefacts.push("he explains the price and shows a receipt");
  if (card && !card.serial && !closeUp && has(flags, "MISSING_SERIAL")) artefacts.push("he gives a serial number for the item itself");

  if (flags.some((f) => PAYMENT_METHOD_FLAGS.includes(f.code))) behaviour.push("agrees to Goods and Services");
  if (has(flags, "URGENCY_PRESSURE")) behaviour.push("agrees to wait until these checks are done");
  if (has(flags, "NAME_MISMATCH")) behaviour.push("explains whose PayPal account that is");
  if (has(flags, "SHIP_BEFORE_PAY_TRICK")) behaviour.push("ships only after the payment is captured");

  // One artefact then one behaviour, so the single line the review closes with pairs something
  // he can photograph with something he can agree to, which is the shape of Matt's example.
  const lines = [...artefacts.slice(0, 1), ...behaviour.slice(0, 1), ...artefacts.slice(1), ...behaviour.slice(1)];
  if (overall === "go" && lines.length === 0) lines.push("anything pushes you to pay another way, or to pay before these checks are done");
  if (!card) lines.push("the seller fills in an item card, so there is a price, a serial and photos to check");
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
