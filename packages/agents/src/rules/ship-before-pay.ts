/**
 * SHIP_BEFORE_PAY_TRICK: the seller tries to get around the checkout's
 * protection: release the funds or mark it received before it ships, pay a
 * deposit or a separate "shipping fee" up front, or confirm delivery early.
 * Stop. Saying "pay and I ship" is normal and is not matched.
 */
import type { Rule } from "./types";
import { findMatch, flag, quoted, sellerPassages } from "./text";

const PATTERNS = [
  /\b(?:release|confirm|approve)\s+(?:the\s+)?(?:payment|funds|money|delivery|receipt)\b[^.?!]{0,60}\b(?:before|first|then|so)\b/i,
  /\bmark\s+(?:it\s+)?(?:as\s+)?(?:received|delivered|complete)\b/i,
  /\b(?:a\s+)?(?:deposit|down\s*payment|holding\s+fee)\b/i,
  /\b(?:shipping|insurance|customs|handling)\s+(?:fee|cost|charge)\b[^.?!]{0,40}\b(?:separate(?:ly)?|up\s*front|upfront|first|outside|directly)\b/i,
  /\bpay\s+(?:the\s+)?(?:shipping|insurance)\s+(?:fee\s+)?(?:separate(?:ly)?|up\s*front|upfront|first|outside)\b/i,
  /\bconfirm\s+(?:delivery|receipt)\b[^.?!]{0,40}\b(?:before|first|now)\b/i,
];

export const shipBeforePayRule: Rule = (input) => {
  const match = findMatch(sellerPassages(input), PATTERNS);
  if (!match) return [];
  return [
    flag(
      "SHIP_BEFORE_PAY_TRICK",
      "stop",
      quoted(match.quote),
      "Wants money or a confirmation before anything ships.",
    ),
  ];
};
