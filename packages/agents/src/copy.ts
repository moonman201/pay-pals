/**
 * Keeps every pal message and summary within the house style: plain words, no
 * em dashes, no exclamation marks, no markdown. Applied to everything the
 * model writes and to our own canned sentences, so the UI never has to clean
 * copy itself. Blank lines between paragraphs survive. Text that runs long is
 * cut at the last full sentence, never mid-word. A deal history hash is moved
 * to the end of its sentence, because the page breaks it onto a line of its
 * own and any punctuation after it is left hanging there.
 */

export const DEFAULT_MAX_LENGTH = 900;

/**
 * Removes the markdown a model reaches for even when told not to: bold and
 * italic stars, underscores, headings, backticks, list bullets, block quotes.
 * A hash that is part of a card number ("Gengar & Mimikyu GX #038") is left alone,
 * because a heading marker is always followed by a space.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[a-z0-9]*\n?/gi, "")
    .replace(/`+/g, "")
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*>[ \t]*/gm, "")
    .replace(/^[ \t]*[-+*•][ \t]+/gm, "")
    .replace(/^[ \t]*\d+[.)][ \t]+/gm, "")
    .replace(/\*+/g, "")
    .replace(/__+/g, "");
}


/** The deal history hash: 64 hex characters. The page prints it on a monospace line of its own. */
const HASH_TOKEN = /\b[0-9a-f]{64}\b/i;

/**
 * Moves a hash out of the middle of its sentence and onto the end of it.
 * The evidence page breaks a 64-character hash onto a line of its own (the
 * Oct 8 fix for the 390 px overflow), so a sentence written as "... at
 * payment time, HASH, against the 20 stored timeline events." leaves a comma
 * stranded at the start of the next line and reads as a typo. Written as
 * "... at payment time against the 20 stored timeline events: HASH." the
 * hash ends the clause, which also reads better inline. A hash that already
 * ends its sentence is left alone, which is the deterministic summary's case.
 */
export function hashEndsItsSentence(text: string): string {
  if (!HASH_TOKEN.test(text)) return text;
  return text
    .split(/(?<=[.?!])(\s+)/)
    .map((part) => moveHashToTheEnd(part))
    .join("");
}

function moveHashToTheEnd(sentence: string): string {
  const match = sentence.match(HASH_TOKEN);
  if (!match || match.index === undefined) return sentence;
  const hash = match[0];
  const afterHash = sentence.slice(match.index + hash.length);
  const trailingSpace = afterHash.match(/\s*$/)![0];
  const after = afterHash.slice(0, afterHash.length - trailingSpace.length);
  // Nothing but punctuation follows, so the hash already ends the clause.
  if (!/[a-z0-9]/i.test(after)) return sentence;
  const head = sentence.slice(0, match.index).replace(/[\s,;:(\[]+$/, "");
  const tail = after.replace(/^[\s,;:)\]]+/, "");
  const body = `${head} ${tail}`
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[.?!]+$/, "");
  return `${body}: ${hash}.${trailingSpace}`;
}

export function plainCopy(text: string, maxLength = DEFAULT_MAX_LENGTH): string {
  const cleaned = hashEndsItsSentence(stripMarkdown(text))
    .replace(/[ \t]*[—–][ \t]*/g, ", ")
    .replace(/!+/g, ".")
    .replace(/\.\s*,/g, ".")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/^[ \t]+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  const head = cleaned.slice(0, maxLength);
  const lastSentenceEnd = Math.max(head.lastIndexOf(". "), head.lastIndexOf("? "), head.lastIndexOf(".\n"));
  if (lastSentenceEnd >= maxLength / 2) return head.slice(0, lastSentenceEnd + 1).trimEnd();
  const lastSpace = head.lastIndexOf(" ");
  return `${(lastSpace > maxLength / 2 ? head.slice(0, lastSpace) : head).trimEnd()}.`;
}

/** Joins sentences, dropping empties, for pal messages built from parts. */
export function sentences(...parts: Array<string | null | undefined | false>): string {
  return plainCopy(parts.filter((p): p is string => typeof p === "string" && p.trim().length > 0).join(" "));
}

/** Joins groups of sentences into short paragraphs separated by a blank line. Empty groups are dropped. */
export function paragraphs(groups: Array<Array<string | null | undefined | false>>, maxLength = DEFAULT_MAX_LENGTH): string {
  const blocks = groups
    .map((group) => group.filter((p): p is string => typeof p === "string" && p.trim().length > 0).join(" "))
    .filter((block) => block.length > 0);
  return plainCopy(blocks.join("\n\n"), maxLength);
}
