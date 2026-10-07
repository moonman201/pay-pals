/**
 * MISSING_SERIAL: the card has no serial number. Caution. Without a serial
 * nobody can prove which unit was sold, and the arrival check has nothing to
 * compare against.
 */
import type { Rule } from "./types";
import { flag } from "./text";

export const missingSerialRule: Rule = ({ card }) => {
  if (card.serial && card.serial.trim().length > 0) return [];
  return [
    flag(
      "MISSING_SERIAL",
      "caution",
      "serial: none on the card",
      "There is no serial number on the card, so there is no way to prove the item that arrives is the one you paid for.",
    ),
  ];
};
