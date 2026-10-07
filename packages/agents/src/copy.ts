/**
 * Keeps every pal message within the house style: plain words, no em dashes,
 * no exclamation marks. Applied to everything the model writes and to our own
 * canned sentences, so the UI never has to clean copy itself.
 */

export function plainCopy(text: string, maxLength = 600): string {
  const cleaned = text
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/!+/g, ".")
    .replace(/\.\s*,/g, ".")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+\n/g, "\n")
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength - 1).trimEnd() + ".";
}

/** Joins sentences, dropping empties, for pal messages built from parts. */
export function sentences(...parts: Array<string | null | undefined | false>): string {
  return plainCopy(parts.filter((p): p is string => typeof p === "string" && p.trim().length > 0).join(" "));
}
