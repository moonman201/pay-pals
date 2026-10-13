/**
 * MISSING_SERIAL: nothing on the card ties a serial to the item itself.
 * Caution, in two cases.
 *
 * 1. The card carries no number at all. Without one nobody can prove which
 *    unit was sold, and the arrival check has nothing to compare against.
 * 2. The only number is the one on the box label. A box is not the item: boxes
 *    get swapped, and an empty box has a perfectly good label. The arrival
 *    check can still compare against that number, but until the item's own
 *    label has been read the buyer is paying on the strength of cardboard, and
 *    should hear that. It clears the moment the card gains a serial off the
 *    item, or a close-up of the item's own label is on the card.
 *
 * A graded item is identified by its certificate number instead, and a new,
 * sealed item has no label to show, so neither is flagged here.
 */
import type { Rule } from "./types";
import { flag } from "./text";
import { hasSerialCloseUp } from "../buyer/proof-question";

export const missingSerialRule: Rule = ({ card }) => {
  if (!card) return [];
  if (card.certNumber && card.certNumber.trim().length > 0) return [];
  if (card.serial && card.serial.trim().length > 0) return [];
  if (card.boxSerial && card.boxSerial.trim().length > 0) {
    if (card.conditionGrade === "new" || hasSerialCloseUp(card)) return [];
    return [
      flag(
        "MISSING_SERIAL",
        "caution",
        `The card has a serial from the box label (${card.boxSerial.trim()}) and none read off the item itself`,
        "The serial is from the box label only. A box does not prove the item inside.",
      ),
    ];
  }
  return [
    flag(
      "MISSING_SERIAL",
      "caution",
      "No serial number on the card, on the item or on the box",
      "No serial number anywhere, so nothing identifies the item that arrives.",
    ),
  ];
};
