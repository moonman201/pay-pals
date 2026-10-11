/**
 * The questions the Buyer Pal works out from the card alone, so they are
 * asked with or without a model and the seller has something to answer.
 *
 * A used electronic device whose card carries no serial read off the item
 * itself is asked for a close-up of its serial label. A box label is not the
 * item, so a boxSerial does not satisfy it; a photo caption that describes a
 * close-up of the item's own label does.
 *
 * A graded item is asked for one photo of the slab next to a handwritten note
 * with the seller's name and today's date. A matching cert shows the grader
 * has a record for that slab; this is the photo that shows the seller is
 * holding it. It is asked even when the verdict is a stop, because it is the
 * one answer that would change the verdict, and when it goes unanswered the
 * evidence pack says so.
 */
import type { ItemCard } from "@pay-pals/contracts";
import { deviceFamily } from "../seller/listing-parse";
import { isPackagingDescription } from "../vision/description";

export const CONSOLE_SERIAL_QUESTION = "Can you send a close-up of the serial label on the console itself?";
/** Asked when the item serial and the box label are one character apart and one was read off a photo. */
export const BOX_LABEL_CLOSE_UP_QUESTION = "Can you send a clearer photo of the serial on the box label?";
export const DEVICE_SERIAL_QUESTION = "Can you send a close-up of the serial label on the device itself?";
export const DATED_NOTE_QUESTION = "Can you send one photo of the slab next to a handwritten note with your name and today's date on it?";

/** A caption that describes a close-up of the item's own label, not the box. */
const SERIAL_CLOSE_UP =
  /\bclose[- ]?up\b[^.]{0,80}\b(?:serial|label|barcode|sticker)\b|\b(?:serial|label|barcode|sticker)\b[^.]{0,40}\bclose[- ]?up\b/i;

/** A caption that describes the item photographed with a dated, handwritten note. */
const DATED_NOTE = /\bhand-?written\b|\bnote with (?:your |my |his |her )?name\b|\btoday'?s date\b|\bdated note\b|\bwritten note\b/i;

export function hasSerialCloseUp(card: ItemCard): boolean {
  return card.photos.some((p) => SERIAL_CLOSE_UP.test(p.whatItShows) && !isPackagingDescription(p.whatItShows));
}

export function hasDatedNotePhoto(card: ItemCard): boolean {
  return card.photos.some((p) => DATED_NOTE.test(p.whatItShows));
}

/** The close-up ask for a used device with no serial of its own on the card, or null. */
export function serialCloseUpQuestion(card: ItemCard | null): string | null {
  if (!card || card.conditionGrade === "new" || card.certNumber) return null;
  if (card.serial || hasSerialCloseUp(card)) return null;
  const family = deviceFamily(`${card.brand} ${card.model} ${card.title}`);
  if (!family) return null;
  return family === "console" ? CONSOLE_SERIAL_QUESTION : DEVICE_SERIAL_QUESTION;
}

/** The dated-note ask for a graded item, or null. */
export function datedNoteQuestion(card: ItemCard | null): string | null {
  if (!card?.certNumber || hasDatedNotePhoto(card)) return null;
  return DATED_NOTE_QUESTION;
}

/** A model question that asks for the same thing as one of ours. */
const SAME_ASK: ReadonlyArray<[string, RegExp]> = [
  [BOX_LABEL_CLOSE_UP_QUESTION, /\bbox label\b|\bserial on the box\b/i],
  [CONSOLE_SERIAL_QUESTION, /\bclose[- ]?up\b|\bphoto of the serial\b|\bserial label\b|\bserial (?:number )?on the console\b/i],
  [DEVICE_SERIAL_QUESTION, /\bclose[- ]?up\b|\bphoto of the serial\b|\bserial label\b|\bserial (?:number )?on the device\b/i],
  [DATED_NOTE_QUESTION, /\bhand-?written\b|\bnote with (?:your )?name\b|\btoday'?s date\b|\bdated note\b/i],
];

/** Our questions first, then the others with any repeat of the same ask removed. */
export function withProofQuestions(ours: Array<string | null>, others: string[]): string[] {
  const asked = ours.filter((q): q is string => typeof q === "string" && q.length > 0);
  if (asked.length === 0) return others;
  const patterns = asked.map((q) => SAME_ASK.find(([text]) => text === q)?.[1]).filter((p): p is RegExp => p !== undefined);
  const normalized = (q: string) => q.toLowerCase().replace(/\s+/g, " ").trim();
  const mine = new Set(asked.map(normalized));
  return [...asked, ...others.filter((q) => !mine.has(normalized(q)) && !patterns.some((p) => p.test(q)))];
}
