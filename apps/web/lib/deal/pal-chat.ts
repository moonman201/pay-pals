/**
 * The pal's private channel, with the review it already posted above
 * collapsed to one line.
 *
 * When a review finishes, the pal says the whole verdict into its own
 * chat. The review panel prints that verdict at the top of the same page,
 * so the longest message in the pane is a copy of something already read
 * (Matt's rule 1). It becomes "Review done: Stop. Details above."
 *
 * Done at display time, by matching the stored message against the stored
 * verdict, rather than by writing a shorter message. Two reasons: the deals
 * already in the database keep their full text and are fixed by this too,
 * and the evidence pack still has the pal's own words to quote.
 */
import type { Message, Verdict } from "@pay-pals/contracts";
import { verdictName } from "./headline";

export function reviewDoneLine(verdict: Verdict): string {
  return `Review done: ${verdictName(verdict)}. Details above.`;
}

function norm(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * The same messages, with any that is verbatim a stored verdict's message
 * replaced by the one-liner.
 *
 * Matched against every verdict on the deal, not only the newest, because a
 * deal that was reviewed twice has two of these and both are copies.
 */
export function collapseReviewMessages(messages: readonly Message[], verdicts: readonly Verdict[]): Message[] {
  if (verdicts.length === 0) return [...messages];
  const byText = new Map(verdicts.map((v) => [norm(v.palMessage), v]));
  return messages.map((message) => {
    const verdict = byText.get(norm(message.text));
    return verdict ? { ...message, text: reviewDoneLine(verdict) } : message;
  });
}

/**
 * A pal's own name off the front of its message in the shared chat.
 *
 * The bubble already carries the pal's face and name, and the header says
 * who the other side is, so "Buyer Pal to seller:" was the third naming on
 * one line. New messages are written without it; this is for the ones
 * already stored, so a seeded room reads the same as a fresh one.
 */
const ADDRESSED = /^(?:buyer|seller)\s+pal\s+to\s+(?:buyer|seller)\s*:\s*/i;

export function stripPalPrefix(messages: readonly Message[]): Message[] {
  return messages.map((message) => (ADDRESSED.test(message.text) ? { ...message, text: message.text.replace(ADDRESSED, "") } : message));
}
