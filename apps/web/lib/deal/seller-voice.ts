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

/** "the seller" after a comma is an appositive to a name ("Sam Lee, the seller on this deal"), so it stays. */
const NOUN = String.raw`(?<!, )\b(?:the seller|this seller)\b`;
const PRONOUN = String.raw`\b(?:he|she)\b`;

/** A sentence that names the buyer: a bare "he" there could be the buyer, so only "the seller" is renamed. */
const NAMES_THE_BUYER = /\bbuyer\b(?! Pal)/i;

function withVerb(pattern: string, sentence: string): string {
  return sentence.replace(new RegExp(`(${pattern})(\\s+)([A-Za-z']+)`, "gi"), (_m, subject: string, space: string, verb: string) => `${match(subject, "you")}${space}${baseVerb(verb)}`);
}

function rename(sentence: string, pronouns: boolean): string {
  let out = withVerb(NOUN, sentence).replace(/\b(?:the seller|this seller)'s\b/gi, (m) => match(m, "your"));
  if (pronouns) {
    out = withVerb(PRONOUN, out)
      .replace(/\bhis\b/gi, (m) => match(m, "your"))
      .replace(/\bhimself\b/gi, (m) => match(m, "yourself"))
      .replace(/\bhim\b/gi, (m) => match(m, "you"))
      .replace(new RegExp(PRONOUN, "gi"), (m) => match(m, "you"));
  }
  return out.replace(new RegExp(NOUN, "gi"), (m) => match(m, "you"));
}

/**
 * Quoted text is somebody's own words, usually the seller's, and stays exactly as written. It is
 * lifted out before anything is renamed and put back after.
 */
export function sellerVoice(text: string): string {
  const quotes: string[] = [];
  const lifted = text.replace(/"[^"]*"|“[^”]*”/g, (q) => `\u0000${quotes.push(q) - 1}\u0000`);
  const renamed = lifted
    .split(/(?<=[.!?])(\s+)/)
    .map((part) => (/^\s*$/.test(part) ? part : rename(part, !NAMES_THE_BUYER.test(part))))
    .join("");
  return renamed.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => quotes[Number(i)]!);
}

/** The status view as the seller reads it: the same rows and verdicts, the seller spoken to as "you". */
export function sellerStatusGroups(groups: readonly StatusGroup[]): StatusGroup[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({ ...item, label: sellerVoice(item.label), detail: sellerVoice(item.detail) })),
    ...(group.note ? { note: { ...group.note, text: sellerVoice(group.note.text) } } : {}),
  }));
}
