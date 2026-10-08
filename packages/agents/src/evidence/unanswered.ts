/**
 * Questions the Buyer Pal asked the seller that never got an answer before
 * payment. Deterministic. A question is any entry in a verdict's
 * questionsForSeller, or a buyer_pal line on the shared deal channel that
 * ends with a question mark. It counts as answered when, before the
 * payment_created event, the seller wrote anything on the deal channel, a
 * card_updated event happened, or the locked card is newer than the card
 * version the verdict reviewed.
 */
import type { EvidenceInput } from "@pay-pals/contracts";

interface Asked {
  text: string;
  askedAt: string;
  cardVersion: number | null;
}

function cleanQuestion(text: string): string {
  return text.replace(/^\s*buyer pal(?:\s+to\s+(?:the\s+)?seller)?\s*:\s*/i, "").trim();
}

export function unansweredQuestions(input: EvidenceInput): string[] {
  const paymentAt = input.timeline.find((e) => e.kind === "payment_created")?.at ?? null;
  const beforePayment = (at: string) => paymentAt === null || at < paymentAt;

  const asked: Asked[] = [];
  for (const verdict of input.verdicts) {
    for (const question of verdict.questionsForSeller) asked.push({ text: question, askedAt: verdict.createdAt, cardVersion: verdict.cardVersion });
  }
  for (const message of input.messages) {
    if (message.channel === "deal" && message.author === "buyer_pal" && message.text.trim().endsWith("?")) {
      asked.push({ text: cleanQuestion(message.text), askedAt: message.at, cardVersion: null });
    }
  }

  const sellerReplies = input.messages.filter((m) => m.channel === "deal" && m.author === "seller").map((m) => m.at);
  const cardUpdates = input.timeline.filter((e) => e.kind === "card_updated").map((e) => e.at);

  // The same question may be asked more than once; it is unanswered when any asking of it got no answer.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of asked) {
    if (!beforePayment(q.askedAt)) continue;
    const key = q.text.toLowerCase().replace(/\s+/g, " ").trim();
    if (key.length === 0 || seen.has(key)) continue;
    const replied = sellerReplies.some((at) => at > q.askedAt && beforePayment(at));
    const cardChanged = cardUpdates.some((at) => at > q.askedAt && beforePayment(at)) || (q.cardVersion !== null && input.lockedCard.version > q.cardVersion);
    if (replied || cardChanged) continue;
    seen.add(key);
    out.push(q.text);
  }
  return out;
}
