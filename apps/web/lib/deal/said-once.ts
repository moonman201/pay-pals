/**
 * Helpers for a page that prints the pal's message and then the pieces it was made from.
 * Whatever the message already says is not printed again beside it.
 */
import type { PalReasoning } from "@pay-pals/contracts";

function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** True when the text says this sentence already, ignoring case and punctuation. An empty sentence is never "said". */
export function alreadySaid(text: string, sentence: string): boolean {
  const s = norm(sentence);
  return s !== "" && norm(text).includes(s);
}

/**
 * The pal's reasons with the lines the message and the flag cards already carry taken out of the
 * groups that only restate them: what it found, and what would change its mind. What it checked
 * and could not check are never trimmed, so nothing the pal admitted is lost.
 */
export function reasonsNotRepeated(reasoning: PalReasoning | null | undefined, message: string, flagLines: readonly string[]): PalReasoning | null | undefined {
  if (!reasoning) return reasoning;
  const said = (line: string) => alreadySaid(message, line) || flagLines.some((f) => alreadySaid(line, f));
  return { ...reasoning, found: reasoning.found.filter((l) => !said(l)), wouldChangeMyMind: reasoning.wouldChangeMyMind.filter((l) => !said(l)) };
}
