/**
 * OTHER (box serial): the serial on the item and the serial on its box label
 * differ. Caution. Not a card error on its own, since boxes get swapped, but
 * the buyer should hear why before paying. Evidence names both serials.
 *
 * A one-edit difference is not a mismatch. When a photo read is in play, two
 * serials that differ by a single character are far more likely to be one
 * number read twice than two different numbers, so no flag is raised and the
 * review says it cannot tell them apart instead. See serial-match.ts for the
 * measurements behind that and for the cost Matt accepted with it.
 */
import type { Rule } from "./types";
import { flag } from "./text";
import { compareSerials } from "../vision/serial-match";

export const boxSerialMismatchRule: Rule = ({ card, serialReadFromPhoto }) => {
  if (!card || !card.serial || !card.boxSerial) return [];
  const verdict = compareSerials(card.serial, card.boxSerial, { readFromPhoto: serialReadFromPhoto === true });
  // "near" raises nothing: the review reports it as something it could not tell apart, and asks
  // for a clearer photo. Claiming a mismatch off a one-character difference is the fault this band
  // exists to stop; claiming a match would be worse.
  if (verdict !== "different") return [];
  return [
    flag(
      "OTHER",
      "caution",
      `Serial on the item ${card.serial}; serial on the box label ${card.boxSerial}`,
      "The serial on the item and the one on its box label differ.",
    ),
  ];
};
