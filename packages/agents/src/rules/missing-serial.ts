/**
 * MISSING_SERIAL: the card has no serial number. Caution. Without a serial
 * nobody can prove which unit was sold, and the arrival check has nothing to
 * compare against. A graded collectible is identified by its certificate
 * number instead, so a card with certNumber is not flagged here.
 */
import type { Rule } from "./types";
import { flag } from "./text";

export const missingSerialRule: Rule = ({ card }) => {
  if (!card) return [];
  if (card.certNumber && card.certNumber.trim().length > 0) return [];
  if (card.serial && card.serial.trim().length > 0) return [];
  return [
    flag(
      "MISSING_SERIAL",
      "caution",
      "No serial number on the card",
      "There is no serial number on the card, so there is no way to prove the item that arrives is the one you paid for.",
    ),
  ];
};
