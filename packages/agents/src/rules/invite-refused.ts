/**
 * INVITE_REFUSED: the seller turned down the Pay Pals invite, either on the
 * record (context.inviteDeclined) or in their own words: Friends and Family
 * only, not doing that app, I only take F&F or Zelle, no need for protection.
 * Stop, and a payment-method flag, so nothing can override it. A refusal is a
 * risk signal, not proof of fraud: a real seller has nothing to lose by
 * joining, so we say what the seller refused and what we will not do.
 */
import type { Rule } from "./types";
import { findMatch, flag, quoted, sellerPassages } from "./text";

const UNPROTECTED = String.raw`(?:f\s*(?:&|and|n|\/)\s*f|friends?\s*(?:and|&|n|\+|\/)\s*family|zelle|cash\s*app|venmo|wire|crypto|cash)`;

const PATTERNS = [
  new RegExp(String.raw`\bfriends?\s*(?:and|&|n|\+|\/)\s*family\s+only\b`, "i"),
  new RegExp(String.raw`\bf\s*(?:&|and|n|\/)\s*f\s+only\b`, "i"),
  new RegExp(String.raw`\b(?:i\s+)?only\s+(?:take|accept|do|use|want)\s+${UNPROTECTED}\b`, "i"),
  new RegExp(String.raw`\b${UNPROTECTED}\s+(?:only|or\s+nothing|or\s+no\s+deal)\b`, "i"),
  /\b(?:not|ain'?t|won'?t\s+be|am\s+not|i'?m\s+not)\s+(?:doing|using|joining|signing\s+up\s+for|downloading|clicking|opening)\s+(?:that|the|this|any|your|some)\s+(?:app|site|link|thing|service|invite|pay\s*pals)\b/i,
  /\b(?:don'?t|do\s+not|no)\s+need\s+(?:the\s+|any\s+|buyer\s+|that\s+)?protection\b/i,
  /\b(?:decline|declining|refuse|refusing|pass\s+on)\s+(?:the\s+|your\s+)?(?:invite|invitation|app|pay\s*pals)\b/i,
  /\bno\s+(?:thanks|thank\s+you)\b[^.?!]{0,30}\b(?:app|link|invite|pay\s*pals|protection)\b/i,
  /\b(?:not|never)\s+(?:going\s+to\s+|gonna\s+)?(?:use|do)\s+(?:goods?\s*(?:and|&)\s*services|buyer\s+protection|pay\s*pals)\b/i,
];

export const inviteRefusedRule: Rule = (input) => {
  const match = findMatch(sellerPassages(input), PATTERNS);
  if (!match && !input.inviteDeclined) return [];
  return [
    flag(
      "INVITE_REFUSED",
      "stop",
      match ? quoted(match.quote) : "The seller declined the Pay Pals invite",
      "The seller refused Pay Pals protection and wants an unprotected payment, which is a risk signal. Pay Pals cannot pay this seller.",
    ),
  ];
};
