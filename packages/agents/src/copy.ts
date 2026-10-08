/**
 * Keeps every pal message within the house style: plain words, no em dashes,
 * no exclamation marks. Applied to everything the model writes and to our own
 * canned sentences, so the UI never has to clean copy itself. A message that
 * runs long is cut at the last full sentence, never mid-word.
 */

export const DEFAULT_MAX_LENGTH = 900;

export function plainCopy(text: string, maxLength = DEFAULT_MAX_LENGTH): string {
  const cleaned = text
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/!+/g, ".")
    .replace(/\.\s*,/g, ".")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+\n/g, "\n")
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
