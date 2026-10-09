/**
 * Questions the Buyer Pal asked the seller that never got an answer before
 * payment. Deterministic. A question is any entry in a verdict's
 * questionsForSeller, or the question sentence in a buyer_pal line on the
 * shared deal channel. It counts as answered when, before the
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

/** The notice apps/web posts for the seller when they press Agree, with or without the warning acknowledgement. */
const AGREEMENT_NOTICE = /^\s*i agree to card version\b/i;
const ACKNOWLEDGED_WARNING = /^\s*i read my pal'?s warning\b/i;
const ONE_WORD_ACK = /^\s*(?:ok|okay|sure|yes|yep|yeah|thanks|thank you|noted|k)\s*[.!]?\s*$/i;

/** A seller message answers a question only if it carries a photo or says something of substance. */
export function answersSomething(message: EvidenceInput["messages"][number]): boolean {
  if (message.photos.length > 0) return true;
  const text = message.text.trim();
  if (text.length === 0) return false;
  if (AGREEMENT_NOTICE.test(text) || ACKNOWLEDGED_WARNING.test(text)) return false;
  return !ONE_WORD_ACK.test(text);
}

function cleanQuestion(text: string): string {
  return text.replace(/^\s*buyer pal(?:\s+to\s+(?:the\s+)?seller)?\s*:\s*/i, "").trim();
}

/** The question in a buyer_pal line: the first sentence that ends in a question mark, without the prefix. */
export function askedQuestion(text: string): string | null {
  const cleaned = cleanQuestion(text);
  const match = cleaned.match(/^[^?]*\?/);
  return match ? match[0].trim() : null;
}

export function unansweredQuestions(input: EvidenceInput): string[] {
  const paymentAt = input.timeline.find((e) => e.kind === "payment_created")?.at ?? null;
  const beforePayment = (at: string) => paymentAt === null || at < paymentAt;

  const asked: Asked[] = [];
  for (const verdict of input.verdicts) {
    for (const question of verdict.questionsForSeller) asked.push({ text: question, askedAt: verdict.createdAt, cardVersion: verdict.cardVersion });
  }
  for (const message of input.messages) {
    if (message.channel !== "deal" || message.author !== "buyer_pal") continue;
    const question = askedQuestion(message.text);
    if (question) asked.push({ text: question, askedAt: message.at, cardVersion: null });
  }

  const sellerReplies = input.messages.filter((m) => m.channel === "deal" && m.author === "seller" && answersSomething(m)).map((m) => m.at);
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
