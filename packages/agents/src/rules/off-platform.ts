/**
 * OFF_PLATFORM_PAYMENT: the seller steers payment away from the PayPal
 * checkout: Zelle, Cash App, wire, gift cards, crypto, or Venmo sent directly
 * rather than through the checkout. Always stop. A plain mention of Venmo is
 * not a flag, because Venmo is a legitimate button in our checkout.
 */
import type { Rule } from "./types";
import { findMatch, flag, quoted, sellerPassages } from "./text";

const PATTERNS = [
  /\bzelle\b/i,
  /\bcash\s*app\b/i,
  /\bapple\s*cash\b/i,
  /\bwire(?:\s+transfer)?\b/i,
  /\bbank\s+transfer\b/i,
  /\bgift\s*cards?\b/i,
  /\bwestern\s+union\b/i,
  /\bmoneygram\b/i,
  /\b(?:crypto|bitcoin|btc|usdt|ethereum)\b/i,
  /\bvenmo\s+me\b/i,
  /\bvenmo\b[^.?!]{0,40}\b(?:friends?|family|personal|direct(?:ly)?|no\s+fees?)\b/i,
  /\b(?:friends?|personal|direct(?:ly)?)\b[^.?!]{0,20}\bvenmo\b/i,
];

export const offPlatformRule: Rule = (input) => {
  const match = findMatch(sellerPassages(input), PATTERNS);
  if (!match) return [];
  return [
    flag(
      "OFF_PLATFORM_PAYMENT",
      "stop",
      quoted(match.quote),
      "The seller is pointing you to a payment method outside the PayPal checkout, where there is no record and no way to dispute.",
    ),
  ];
};
