/**
 * BuyerPal.review: price check, rules, then one Claude call for judgment and
 * plain words. The rules decide what is a flag; the model explains and adds.
 */
import type { ItemCard, MarketPriceLookup, Message, PalResult, PriceCheck, RedFlag, ReviewContext, Verdict } from "@pay-pals/contracts";
import type { ClaudeClient } from "../claude/client";
import { callTool } from "../claude/tool-call";
import { plainCopy, sentences } from "../copy";
import { overallFromFlags, runRules } from "../rules";
import { buildGroundingCorpus } from "./grounding";
import { mergeModelReview } from "./merge-flags";
import { ModelReviewSchema, REVIEW_TOOL } from "./review-tool";

export const MAX_QUESTIONS = 3;
/** Questions a buyer can act on come first: something to photograph or show. */
const ACTIONABLE = /\b(?:photo|picture|serial|receipt|proof of purchase|invoice|box|screenshot|video)\b/i;

export function pickQuestions(questions: string[]): string[] {
  const cleaned = questions.map((q) => plainCopy(q, 300)).filter((q) => q.length > 0);
  const actionable = cleaned.filter((q) => ACTIONABLE.test(q));
  const rest = cleaned.filter((q) => !ACTIONABLE.test(q));
  return [...actionable, ...rest].slice(0, MAX_QUESTIONS);
}

export interface ReviewDeps {
  client: ClaudeClient | null;
  priceLookup: MarketPriceLookup;
}

const FLAG_WORDS: Record<RedFlag["code"], string> = {
  FRIENDS_AND_FAMILY_REQUEST: "a Friends and Family payment request",
  OFF_PLATFORM_PAYMENT: "payment outside the PayPal checkout",
  PRICE_FAR_BELOW_MARKET: "a price far below market",
  URGENCY_PRESSURE: "pressure to pay right now",
  NAME_MISMATCH: "a PayPal account that does not match the seller",
  STOCK_OR_REUSED_PHOTO: "catalog photos instead of the real item",
  MISSING_SERIAL: "no serial number",
  SHIP_BEFORE_PAY_TRICK: "a trick to get money or a confirmation before shipping",
  OTHER: "another concern",
};

const SYSTEM = [
  "You are the Buyer Pal in Pay Pals. You protect a buyer in a deal with a stranger on an online marketplace.",
  "Deterministic rules have already run. Their flags are fixed facts: they stay in the verdict exactly as given, you cannot remove or soften them, and you should not restate them as new flags.",
  "Your job: notice anything in the chat or on the card that the rules missed, raise a severity when the chat makes a flag worse, reword explanations in plain words a first-time buyer understands, list up to three questions for the seller, and write a short message to the buyer.",
  "A flag needs evidence that exists: quote the seller's words from the chat, or name the card field and its value. A missing answer, an unasked question or something you merely wish you knew is never a flag. It is a question for the seller.",
  "When the rules raised nothing and the price sits in the market range, the verdict is go unless the chat itself contains something the rules missed. Do not add a flag to justify caution.",
  "Questions for the seller: at most three, and prefer things the buyer can act on, such as a photo of a specific part, the serial, or a receipt. If the card already answers it, do not ask.",
  "For used electronics, proof that it powers on and a system or settings screen that shows the serial are fair things to ask for when the card does not show them (for a wearable, battery health).",
  "Pay Pals only ever pays through a PayPal Goods and Services checkout. Any request to pay another way ends the deal.",
  "Writing rules: plain words, short sentences, no em dashes, no exclamation marks, no marketing voice. Say what to do next.",
].join("\n");

function transcript(chat: Message[]): string {
  return chat
    .filter((m) => m.channel === "deal")
    .map((m) => `${m.author}: ${m.text}${m.photos.length > 0 ? ` [photo: ${m.photos.map((p) => p.whatItShows).join("; ")}]` : ""}`)
    .join("\n");
}

function priceLine(priceCheck: PriceCheck | null): string {
  if (!priceCheck || priceCheck.marketLow <= 0) return "No market price was available.";
  return `Market range $${priceCheck.marketLow} to $${priceCheck.marketHigh} (${priceCheck.provider}).`;
}

function fallbackQuestions(card: ItemCard, flags: RedFlag[]): string[] {
  if (overallFromFlags(flags) === "stop") return [];
  const questions: string[] = [];
  if (!card.serial) questions.push("Please add a clear photo of the back of the item showing the serial number.");
  if (flags.some((f) => f.code === "STOCK_OR_REUSED_PHOTO")) {
    questions.push("Please add a photo of the actual unit next to a note with today's date.");
  }
  return questions;
}

function fallbackMessage(card: ItemCard, flags: RedFlag[], priceCheck: PriceCheck | null): string {
  const overall = overallFromFlags(flags);
  const list = (f: RedFlag[]) => f.map((x) => FLAG_WORDS[x.code]).join(", ");
  if (overall === "stop") {
    const stops = flags.filter((f) => f.severity === "stop");
    const paymentFlag = stops.some((f) => f.code === "FRIENDS_AND_FAMILY_REQUEST" || f.code === "OFF_PLATFORM_PAYMENT");
    return sentences(
      `Stop. I found ${list(stops)}.`,
      paymentFlag ? "Pay Pals only pays through a Goods and Services checkout, so this deal cannot go ahead." : "Do not pay for this.",
    );
  }
  if (overall === "caution") {
    return sentences(`Caution. I found ${list(flags)}.`, "Get answers before you pay. I have listed what to ask the seller.");
  }
  return sentences(
    "This looks fair.",
    priceCheck && priceCheck.marketLow > 0
      ? `The asking price of $${card.askingPrice} sits within the market range of $${priceCheck.marketLow} to $${priceCheck.marketHigh}.`
      : null,
    card.serial ? `The serial ${card.serial} is on the card, so we can check it when the item arrives.` : null,
    "Nothing in the chat worries me.",
  );
}

export async function reviewCard(card: ItemCard, chat: Message[], context: ReviewContext | undefined, deps: ReviewDeps): Promise<PalResult<Verdict>> {
  let priceCheck: PriceCheck | null = null;
  try {
    priceCheck = await deps.priceLookup.priceRange({ brand: card.brand, model: card.model, condition: card.conditionGrade });
  } catch (error) {
    console.warn(`[pay-pals agents] price lookup failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const ruleFlags = runRules({ card, chat, priceCheck, seller: context?.seller ?? null });

  let review = null;
  if (deps.client) {
    const facts = ruleFlags.length === 0 ? "The rules raised no flags." : JSON.stringify(ruleFlags, null, 2);
    const result = await callTool({
      client: deps.client,
      system: SYSTEM,
      content: [
        { type: "text", text: `Item card (version ${card.version}):\n${JSON.stringify(card, null, 2)}` },
        { type: "text", text: `Shared chat, in order:\n${transcript(chat) || "(no messages yet)"}` },
        { type: "text", text: priceLine(priceCheck) },
        { type: "text", text: `Fixed facts. Flags raised by the rules, which will appear in the verdict as given:\n${facts}` },
      ],
      tool: REVIEW_TOOL,
      schema: ModelReviewSchema,
    });
    review = result.value;
  }

  const flags = mergeModelReview(ruleFlags, review, buildGroundingCorpus(card, chat));
  const overall = overallFromFlags(flags);
  const questions = pickQuestions(review?.questions_for_seller ?? []);
  const questionsForSeller = questions.length > 0 ? questions : pickQuestions(fallbackQuestions(card, flags));
  const palMessage = review?.pal_message ? plainCopy(review.pal_message) : fallbackMessage(card, flags, priceCheck);

  const verdict: Verdict = {
    dealId: card.dealId,
    cardVersion: card.version,
    overall,
    flags,
    priceCheck,
    questionsForSeller,
    palMessage,
    createdAt: new Date().toISOString(),
  };
  return { data: verdict, palMessage };
}
