/**
 * FRIENDS_AND_FAMILY_REQUEST: the seller asks to be paid as Friends and
 * Family, or asks the buyer to avoid Goods and Services. Always stop, because
 * Pay Pals only ever creates a Goods and Services checkout payment.
 */
import type { Rule } from "./types";
import { findMatch, flag, quoted, sellerPassages } from "./text";

const PATTERNS = [
  /\bfriends?\s*(?:and|&|n|\+)\s*family\b/i,
  /\bf\s*(?:&|and|n)\s*f\b/i,
  /\bfnf\b/i,
  /\b(?:no|not|don'?t|avoid|skip)\b[^.?!]{0,40}\bgoods?\s*(?:and|&)\s*services\b/i,
  /\bgoods?\s*(?:and|&)\s*services\b[^.?!]{0,40}\b(?:fees?|charges?)\b/i,
  /\b(?:send|pay|mark)(?:\s+it)?\s+as\s+(?:a\s+)?(?:gift|personal)\b/i,
];

export const friendsAndFamilyRule: Rule = (input) => {
  const match = findMatch(sellerPassages(input), PATTERNS);
  if (!match) return [];
  return [
    flag(
      "FRIENDS_AND_FAMILY_REQUEST",
      "stop",
      quoted(match.quote),
      "The seller wants a Friends and Family payment, which has no buyer protection, so Pay Pals will not move money this way.",
    ),
  ];
};
