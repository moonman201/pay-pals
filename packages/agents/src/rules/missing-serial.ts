/**
 * MISSING_SERIAL: the card carries no number at all. Caution. Without one
 * nobody can prove which unit was sold, and the arrival check has nothing to
 * compare against. A graded item is identified by its certificate number
 * instead, and a number read off the box label still gives the arrival check
 * something to compare, so neither is flagged here.
 */
import type { Rule } from "./types";
import { flag } from "./text";

export const missingSerialRule: Rule = ({ card }) => {
  if (!card) return [];
  if (card.certNumber && card.certNumber.trim().length > 0) return [];
  if (card.serial && card.serial.trim().length > 0) return [];
  // A number read off the box label is something to check against at arrival, so it is not a caution.
  // The Buyer Pal asks for the close-up of the item's own label through its questions instead.
  if (card.boxSerial && card.boxSerial.trim().length > 0) return [];
  return [
    flag(
      "MISSING_SERIAL",
      "caution",
      "No serial number on the card, on the item or on the box",
      "No serial number anywhere, so nothing identifies the item that arrives.",
    ),
  ];
};
