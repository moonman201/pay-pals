/**
 * URGENCY_PRESSURE: the seller pushes the buyer to pay right now. Caution.
 * Deadlines about the seller's own life ("moving next month", "moving out
 * of state tomorrow") are not pressure by themselves. Pressure is a demand on
 * the buyer: it has to be today, first to send wins, others are waiting, pay
 * in the next hour or it goes to the next person.
 */
import type { Rule } from "./types";
import { findAllMatches, flag, sellerPassages } from "./text";

const PATTERNS = [
  /\b(?:has|have|needs?|got|need it)\s+to\s+(?:be|go|happen)\s+(?:today|tonight|now|right now)\b/i,
  /\b(?:today|tonight)\s+only\b/i,
  /\bneed(?:s|ed)?\s+(?:it\s+)?gone\s+(?:today|tonight|now|asap)\b/i,
  /\bfirst\s+(?:one\s+|person\s+)?to\s+(?:pay|send|buy|transfer|venmo|zelle)\b/i,
  /\bfirst\s+come[, ]+first\s+serve/i,
  /\b(?:other|more|several|\d+|two|three|four|five)\s+(?:other\s+)?(?:people|buyers|folks|guys)\s+(?:asking|interested|waiting|lined up|messaging|want)/i,
  /\b(?:pay|send|decide|buy)\s+(?:it\s+)?(?:now|today|tonight|right now)\s+or\b/i,
  /\b(?:act|move|decide)\s+(?:fast|quick|quickly|now)\b/i,
  /\b(?:within|in)\s+the\s+(?:next\s+)?(?:hour|few hours|\d+\s+minutes)\b/i,
  /\bor\s+it\s+goes\s+to\s+(?:the\s+)?(?:next|someone|another)\b/i,
  /\bno\s+time\s+for\s+(?:that|questions|this)\b/i,
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
      "The seller is pushing you to pay before you can check anything, which is a risk signal.",
    ),
  ];
};
