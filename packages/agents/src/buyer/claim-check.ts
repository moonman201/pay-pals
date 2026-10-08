/**
 * Keeps the model's message honest about what was examined. When no image
 * was read, the message may not describe what the photos show; when PSA was
 * not contacted, it may not say PSA's database was checked; when the cert
 * was not checked at all, it may not say what PSA found. The review re-asks
 * the model once with the offending phrases named, then falls back to the
 * rules-only text.
 */
import type { CertCheck } from "@pay-pals/contracts";

export interface ClaimContext {
  /** True when the vision model read at least one of the card's photos. */
  imagesRead: boolean;
  /** True when the record came from PSA itself rather than a demo record or no lookup. */
  psaContacted: boolean;
  /** The cert check, or null when there was none. matches null means the cert was not checked. */
  certCheck: CertCheck | null;
  /** Presentation only: in public mode the message may not talk about photo files loading. */
  publicMode?: boolean;
}

const LOADING_TALK: RegExp[] = [
  /\b(?:could|can|did|would)\s*(?:not|n't)?\s+be\s+(?:loaded|opened|viewed|fetched|displayed)\b/i,
  /\b(?:photo|picture|image|file)s?\b[^.]{0,40}\b(?:were|was|been|get|got)\s+(?:not\s+)?(?:loaded|opened|viewed|fetched|displayed)\b/i,
  /\b(?:could|can|did)\s*(?:not|n't)\s+(?:load|open|view|fetch|access)\b[^.]{0,40}\b(?:photo|picture|image|file)s?\b/i,
  /\b(?:photo|picture|image|file)s?\b[^.]{0,40}\b(?:failed to load|would not load|won'?t load|did not load|404)\b/i,
  /\b(?:loaded|opened) (?:and|or) (?:viewed|checked|reviewed)\b/i,
];

const PHOTO_CLAIMS: RegExp[] = [
  /\bstock (?:photo|image|picture)s?\b/i,
  /\b(?:photo|picture|image)s?\s+(?:that\s+)?match(?:es|ed|ing)?\b/i,
  /\bmatch(?:es|ed|ing)?\s+the\s+(?:photo|picture|image)s?\b/i,
  /\bI (?:can |could )?see\b/i,
  /\bI looked at\b/i,
  /\b(?:photo|picture|image)s?\s+(?:clearly\s+)?(?:show|shows|showed|showing|confirm|confirms|confirmed|prove|proves)\b/i,
  /\bvisible (?:in|on) the (?:photo|picture|image)s?\b/i,
  /\b(?:in|on) the (?:photo|picture|image)s?,? (?:you|we|I) can\b/i,
  /\breal,? working unit\b/i,
  /\bgenuine (?:photo|picture|image)s?\b/i,
  /\bseller'?s own (?:photo|picture|image)s?\b/i,
  /\bthe (?:photo|picture|image)s? (?:is|are|look|looks) (?:real|genuine|authentic|original)\b/i,
];

const PSA_CONTACT_CLAIMS: RegExp[] = [
  /\bPSA'?s? (?:own )?(?:database|records?|system|registry|website|api)\b/i,
  /\b(?:we|I|pal) (?:checked|contacted|queried|looked up|verified|ran)[^.]{0,40}\bPSA\b/i,
  /(?<!\bnot )\bchecked (?:with|against) PSA\b/i,
];

const PSA_RESULT_CLAIMS: RegExp[] = [
  /\bPSA (?:confirms|confirmed|verifies|verified|has no record|shows|showed|reports|reported|says|said|lists|registered)\b/i,
  /\b(?:not )?registered (?:to|as|with) PSA\b/i,
  /\bcert(?:ificate)? (?:is|was) (?:fake|invalid|real|genuine|valid|not found|unknown to PSA)\b/i,
];

/** The phrases in the text that the context does not support. Empty means the text is honest. */
export function unfoundedClaims(text: string, context: ClaimContext): string[] {
  const found: string[] = [];
  const scan = (patterns: RegExp[]) => {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) found.push(match[0]);
    }
  };
  if (!context.imagesRead) scan(PHOTO_CLAIMS);
  if (!context.psaContacted) scan(PSA_CONTACT_CLAIMS);
  if (context.certCheck && context.certCheck.matches === null) scan(PSA_RESULT_CLAIMS);
  if (context.publicMode) scan(LOADING_TALK);
  return [...new Set(found)];
}

/** The instruction for the second attempt. */
export function reaskInstruction(claims: string[], context: ClaimContext): string {
  const reasons: string[] = [];
  if (!context.imagesRead) reasons.push("no photo was looked at, so nothing may be said about what the photos show; the captions are the seller's words");
  if (!context.psaContacted) reasons.push("PSA was not contacted, so do not mention PSA's database or say PSA was checked");
  if (context.certCheck && context.certCheck.matches === null) reasons.push(`the cert was not checked; say exactly: ${context.certCheck.explanation}`);
  if (context.publicMode) reasons.push("do not mention whether photo files loaded, opened or could be viewed; say only what you checked from the card and the chat");
  return `Your draft message contained claims that cannot be supported: ${claims.map((c) => `"${c}"`).join(", ")}. Reasons: ${reasons.join("; ")}. Rewrite the message without any such claim. State only what was actually examined.`;
}
