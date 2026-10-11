/**
 * Which chat message a flag's evidence was quoted from, so the quote can
 * link to it instead of asking the reader to go and find it.
 *
 * A pal backs a flag with the seller's own words. Those words are already
 * on the page, in the shared chat, and a reader who wants to see the quote
 * in context has had to scroll and search for it by eye.
 *
 * Deliberately strict. It links only when exactly one message contains the
 * quote: an evidence line that matches two messages links to neither,
 * because a link to the wrong message is worse than no link. It also links
 * only for a quote long enough to be one, so a short rule reading like
 * "pay today" cannot match half the chat.
 */
import type { Message } from "@pay-pals/contracts";

/** Below this a "quote" is a fragment, and a fragment matches too much. */
const MIN_QUOTE = 15;

function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’“”]/g, (c) => (c === "‘" || c === "’" ? "'" : '"'))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The part of an evidence line that is actually the quote.
 *
 * A pal writes the quote inside a frame of its own: `Seller wrote: "..."`,
 * or `Photo "..." is the same picture as ...`. Matching the whole string
 * against the chat finds nothing, because the frame was never said by
 * anyone. The longest run between quote marks is the quote.
 */
function quotedSpan(evidence: string): string {
  const spans = [...evidence.matchAll(/["“]([^"”]{4,})["”]/g)].map((m) => m[1]!);
  if (spans.length === 0) return evidence;
  return spans.reduce((longest, span) => (span.length > longest.length ? span : longest));
}

export function evidenceSourceId(evidence: string | null | undefined, messages: readonly Message[]): string | null {
  const quote = norm(quotedSpan(evidence ?? ""));
  if (quote.length < MIN_QUOTE) return null;
  const hits = messages.filter((m) => norm(m.text).includes(quote));
  return hits.length === 1 ? hits[0]!.id : null;
}

/** The anchor a chat message carries, and the target the quote links to. Both ends read it from here. */
export function messageAnchor(id: string): string {
  return `msg-${id}`;
}
