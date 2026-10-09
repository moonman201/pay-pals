/**
 * Keeps every pal message and summary within the house style: plain words, no
 * em dashes, no exclamation marks, no markdown. Applied to everything the
 * model writes and to our own canned sentences, so the UI never has to clean
 * copy itself. Blank lines between paragraphs survive. Text that runs long is
 * cut at the last full sentence, never mid-word.
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

export function plainCopy(text: string, maxLength = DEFAULT_MAX_LENGTH): string {
  const cleaned = stripMarkdown(text)
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
