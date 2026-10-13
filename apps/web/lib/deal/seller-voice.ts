/**
 * The seller reads the room too, and a room written to the buyer talks about
 * the seller as "he" or "the seller". A seller should be told "you", not read
 * about themselves in the third person.
 *
 * This turns one sentence from the buyer's phrasing into the seller's, at
 * display time. It only touches the words that name the seller: he, she,
 * his, him, the seller, this seller, and the verb that follows a subject
 * ("he sends" becomes "you send"). It is not a grammar engine. A sentence it
 * cannot improve is returned as it came.
 */

import type { StatusGroup } from "./status-view";

const IRREGULAR: Readonly<Record<string, string>> = { has: "have", is: "are", was: "were", does: "do", goes: "go" };

/** Words that follow a subject unchanged: modals, past tense, negation and the like. */
const KEEP = /^(will|would|can|could|should|must|may|might|shall|did|had|do|not|never|also|still|already|just|only|ever|now|then|won't|can't|doesn't|didn't|isn't|wasn't|cannot|[a-z]+ed)$/;

function match(source: string, replacement: string): string {
  return /^[A-Z]/.test(source) ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement;
}

function baseVerb(word: string): string {
  const lower = word.toLowerCase();
  if (IRREGULAR[lower]) return IRREGULAR[lower]!;
  if (KEEP.test(lower)) return word;
  if (/(ss|us|is)$/.test(lower) || !lower.endsWith("s")) return word;
  if (/ies$/.test(lower)) return word.slice(0, -3) + "y";
  if (/(ch|sh|x|z|ss)es$/.test(lower)) return word.slice(0, -2);
  return word.slice(0, -1);
}

const SUBJECT = String.raw`(?<!, )\b(?:he|she|the seller|this seller)\b`;

export function sellerVoice(text: string): string {
  return text
    .replace(new RegExp(`(${SUBJECT})(\\s+)([A-Za-z']+)`, "gi"), (_m, subject: string, space: string, verb: string) => `${match(subject, "you")}${space}${baseVerb(verb)}`)
    .replace(/\b(?:the seller|this seller)'s\b/gi, (m) => match(m, "your"))
    .replace(/\bhis\b/gi, (m) => match(m, "your"))
    .replace(/\bhimself\b/gi, (m) => match(m, "yourself"))
    .replace(/\bhim\b/gi, (m) => match(m, "you"))
    .replace(new RegExp(SUBJECT, "gi"), (m) => match(m, "you"));
}

/** The status view as the seller reads it: the same rows and verdicts, the seller spoken to as "you". */
export function sellerStatusGroups(groups: readonly StatusGroup[]): StatusGroup[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({ ...item, label: sellerVoice(item.label), detail: sellerVoice(item.detail) })),
    ...(group.note ? { note: { ...group.note, text: sellerVoice(group.note.text) } } : {}),
  }));
}
