/**
 * The Buyer Pal review, and what follows from it. A payment-method flag
 * (Friends and Family, off-platform, a refused invite) ends the deal on the
 * spot (Decision 1 and 7); everything else waits for the buyer.
 *
 * In INVITED there is no card yet: the pal reviews the chat and the refusal
 * alone, and the deal moves INVITED -> REVIEWED (-> BLOCKED on a refusal).
 */
import { isPaymentMethodFlag, type Deal, type DealEvent, type Message, type ReviewContext, type ReviewProgress, type Verdict } from "@pay-pals/contracts";
import type { Services } from "../../services";
import { FlowError } from "../errors";
import { absoluteCard, absoluteMessages } from "../photo-urls";
import { expectState, mustDeal, note, say } from "./shared";

export const BLOCK_SUMMARY = "Blocked. Pay Pals will not move money outside a Goods and Services payment.";

export function wasInviteDeclined(events: readonly DealEvent[]): boolean {
  return events.some((e) => e.kind === "invite_declined");
}

function normalizeQuestion(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/**
 * The questions the Buyer Pal has not already put in this deal's chat.
 *
 * Questions are posted merged into one message, so both sides are split into
 * sentences first and compared whole, normalized for case and punctuation.
 * A substring match would call "Is it new?" asked after "Is it newer than
 * 2020?". A sentence repeated within the batch is kept once.
 */
function sentences(text: string): string[] {
  return text.split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter(Boolean);
}

export function unaskedQuestions(questions: readonly string[], chat: readonly Message[]): string[] {
  const seen = new Set(
    chat
      .filter((m) => m.channel === "deal" && m.author === "buyer_pal")
      .flatMap((m) => sentences(m.text))
      .map(normalizeQuestion),
  );
  const fresh: string[] = [];
  for (const sentence of questions.flatMap(sentences)) {
    const key = normalizeQuestion(sentence);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    fresh.push(sentence);
  }
  return fresh;
}

/** Everything the Buyer Pal should know beyond the card and the chat. Built the same way for every review. */
export function reviewContext(deal: Deal, events: readonly DealEvent[]): ReviewContext {
  return {
    dealId: deal.id,
    seller: deal.seller,
    listingUrl: deal.listingUrl,
    sellerJoined: deal.sellerJoinedAt !== null,
    inviteDeclined: wasInviteDeclined(events),
  };
}

/**
 * Everything the review needs, gathered and checked, before the Buyer Pal is
 * called. Split out so a streaming route can answer a bad request with a
 * proper status before it opens the stream: once the body has started there
 * is no status left to send.
 */
export async function prepareReview(services: Services, dealId: string) {
  const deal = await mustDeal(services, dealId);
  expectState(deal, "LISTED", "INVITED");
  const { store } = services;
  const card = await store.getCurrentCard(dealId);
  const [chat, events] = await Promise.all([store.listMessages(dealId, "deal"), store.listEvents(dealId)]);
  if (deal.state === "INVITED" && chat.length === 0 && !wasInviteDeclined(events)) {
    throw new FlowError("There is nothing to review yet. Paste the seller's reply in the chat, or wait for them to join.", 409);
  }
  return { deal, card, chat, events };
}

export interface RunReviewOptions {
  /**
   * Findings as they land, for the page. Progress is never the record: the
   * verdict below is, and it is saved here whether or not anyone listened.
   */
  onProgress?: (event: ReviewProgress) => void;
}

export async function runReview(services: Services, dealId: string, options: RunReviewOptions = {}): Promise<Verdict> {
  const prepared = await prepareReview(services, dealId);
  let deal = prepared.deal;
  const { card, chat, events } = prepared;
  const { store } = services;

  const result = await services.buyerPal.review(card ? absoluteCard(card) : null, absoluteMessages(chat), reviewContext(deal, events), {
    onProgress: options.onProgress,
  });
  // A second review of the same card can be running on another server instance, which the
  // in-process registry cannot see. Whoever finishes first saves; the other stops here, so
  // one card version never gets two verdicts.
  const after = await mustDeal(services, dealId);
  if (after.state !== deal.state || after.currentCardVersion !== deal.currentCardVersion) {
    throw new FlowError("This deal was already reviewed. Reload the page to see the result.", 409);
  }
  const verdict = await store.saveVerdict(result.data);
  await say(services, dealId, "buyer_pal", "buyer_pal", result.palMessage);
  const what = card ? `card version ${card.version}` : "the seller's reply, with no card";
  await note(services, dealId, "review_posted", "buyer_pal", `Buyer Pal reviewed ${what}: ${verdict.overall}.`);
  deal = await store.transition(dealId, "REVIEWED", "system", "Reviewed.");

  if (verdict.questionsForSeller.length > 0 && card) {
    const asks = verdict.questionsForSeller.map((q) => `"${q}"`).join(" ");
    // A blocked deal has no add control, so the line must not point at one.
    const closing = verdict.flags.some(isPaymentMethodFlag) ? "The deal is blocked, so the card cannot change." : "Add it below and I will save a new card version.";
    await say(services, dealId, "seller_pal", "seller_pal", `The buyer's pal asked for something before they commit: ${asks} ${closing}`);
    // No "Buyer Pal to seller:" prefix. Every message in this channel already
    // shows who said it and who the other side is, so the prefix was the third
    // time the same page named them (Matt's rule 1).
    const fresh = unaskedQuestions(verdict.questionsForSeller, chat);
    if (fresh.length > 0) await say(services, dealId, "deal", "buyer_pal", fresh.join(" "));
  }

  if (verdict.flags.some(isPaymentMethodFlag)) {
    await store.transition(dealId, "BLOCKED", "buyer_pal", BLOCK_SUMMARY);
    await say(services, dealId, "deal", "buyer_pal", BLOCK_SUMMARY + " No order was created and no money moved.");
  }
  return verdict;
}
