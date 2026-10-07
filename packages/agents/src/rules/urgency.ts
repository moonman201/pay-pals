/**
 * URGENCY_PRESSURE: the seller pushes the buyer to pay right now. Caution.
 * Deadlines about the seller's own life ("moving next month", "deploy
 * Friday") are not pressure by themselves. Pressure is a demand on the buyer:
 * it has to be today, first to pay wins, others are waiting.
 */
import type { Rule } from "./types";
import { findAllMatches, flag, sellerPassages } from "./text";

const PATTERNS = [
  /\b(?:has|have|needs?|got|need it)\s+to\s+(?:be|go|happen)\s+(?:today|tonight|now|right now)\b/i,
  /\b(?:today|tonight)\s+only\b/i,
  /\bneed(?:s|ed)?\s+(?:it\s+)?gone\s+(?:today|tonight|now|asap)\b/i,
  /\bfirst\s+(?:one\s+|person\s+)?to\s+pay\b/i,
  /\bfirst\s+come[, ]+first\s+serve/i,
  /\b(?:other|more|several|\d+|three|four|five)\s+(?:people|buyers|folks|guys)\s+(?:asking|interested|waiting|lined up|messaging|want)/i,
  /\b(?:pay|send|decide|buy)\s+(?:it\s+)?(?:now|today|tonight|right now)\s+or\b/i,
  /\b(?:act|move|decide)\s+(?:fast|quick|quickly|now)\b/i,
  /\b(?:within|in)\s+the\s+(?:next\s+)?(?:hour|few hours|\d+\s+minutes)\b/i,
  /\b(?:last|final)\s+chance\b/i,
  /\b(?:offer|price)\s+(?:expires|ends)\s+(?:today|tonight|soon|in)\b/i,
];

export const urgencyRule: Rule = (input) => {
  const quotes = findAllMatches(sellerPassages(input), PATTERNS);
  if (quotes.length === 0) return [];
  return [
    flag(
      "URGENCY_PRESSURE",
      "caution",
      `Seller wrote: ${quotes.map((q) => `"${q}"`).join(" and ")}`,
      "The seller is pushing you to pay before you can check anything, which is how rushed buyers get burned.",
    ),
  ];
};
