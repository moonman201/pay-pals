/**
 * OTHER (box serial): the serial on the item and the serial on its box label
 * differ. Caution. Not a card error on its own, since boxes get swapped, but
 * the buyer should hear why before paying. Evidence names both serials.
 */
import type { Rule } from "./types";
import { flag } from "./text";

function normalize(serial: string): string {
  return serial.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export const boxSerialMismatchRule: Rule = ({ card }) => {
  if (!card || !card.serial || !card.boxSerial) return [];
  if (normalize(card.serial) === normalize(card.boxSerial)) return [];
  return [
    flag(
      "OTHER",
      "caution",
      `Serial on the item ${card.serial}; serial on the box label ${card.boxSerial}`,
      "The serial on the item does not match the serial on its box label, so ask the seller why before you pay.",
    ),
  ];
};
