/**
 * BuyerPal.review: price check, cert lookup and photo reads, rules, then one
 * Claude call for judgment and plain words. The rules decide what is a flag;
 * the model explains and adds. With no card yet (a buyer-started deal the
 * seller has not joined, or a refusal) only the chat rules run. The model is
 * told exactly what was examined (which photos were read, whether PSA was
 * contacted) and its message is checked against that before it is shown.
 */
import type {
  CertCheck,
  CertLookup,
  CertRecord,
  ItemCard,
  MarketPriceLookup,
  Message,
  PalResult,
  PriceCheck,
  RedFlag,
  ReviewContext,
  Verdict,
} from "@pay-pals/contracts";
import { compareCertRecord } from "../cert/compare";
import type { ClaudeClient } from "../claude/client";
import { callTool } from "../claude/tool-call";
import { plainCopy, sentences } from "../copy";
import { collapsePaymentFlags, overallFromFlags, runRules, type PhotoMatch } from "../rules";
import type { ImageFetcher } from "../vision/fetch-image";
import { describeLooking, readPhotos, type PhotoReading } from "../vision/read-photo";
import { reaskInstruction, unfoundedClaims, type ClaimContext } from "./claim-check";
import { buildGroundingCorpus } from "./grounding";
import { mergeModelReview } from "./merge-flags";
import { photoFactsBlock } from "./photo-facts";
import { findReusedPhotos, type PhotoMatchDeps } from "./photo-match";
import { proofQuestion, withProofQuestion } from "./proof-question";
import { ModelReviewSchema, REVIEW_TOOL, type ModelReview } from "./review-tool";

export const MAX_QUESTIONS = 3;
/** Questions a buyer can act on come first: something to photograph or show. */
const ACTIONABLE = /\b(?:photo|picture|serial|receipt|proof of purchase|invoice|box|screenshot|video|cert)\b/i;

export function pickQuestions(questions: string[]): string[] {
  const cleaned = questions.map((q) => plainCopy(q, 300)).filter((q) => q.length > 0);
  const actionable = cleaned.filter((q) => ACTIONABLE.test(q));
  const rest = cleaned.filter((q) => !ACTIONABLE.test(q));
  return [...actionable, ...rest].slice(0, MAX_QUESTIONS);
}

export interface ReviewDeps {
  client: ClaudeClient | null;
  priceLookup: MarketPriceLookup;
  certLookup?: CertLookup | null;
  /** Known photos to compare the card's photos against. Omit to skip the image check. */
  photoMatch?: PhotoMatchDeps | null;
  fetchImage?: ImageFetcher;
  photoBaseUrl?: string | null;
  /** Presentation only (see presentation.ts): no sentences about photo files loading. Decisions are unchanged. */
  publicMode?: boolean;
}

/** The sentence added whenever the range came from the fixtures rather than a live source. */
export const REFERENCE_RANGE_NOTE = "That is a reference range for this demo, not a live quote.";

const FLAG_WORDS: Record<RedFlag["code"], string> = {
  FRIENDS_AND_FAMILY_REQUEST: "a Friends and Family payment request",
  OFF_PLATFORM_PAYMENT: "payment outside the PayPal checkout",
  PRICE_FAR_BELOW_MARKET: "a price far below market",
  URGENCY_PRESSURE: "pressure to pay right now",
  NAME_MISMATCH: "a PayPal account that does not match the seller",
  STOCK_OR_REUSED_PHOTO: "a photo that is the same picture as one from another listing",
  MISSING_SERIAL: "no serial number",
  SHIP_BEFORE_PAY_TRICK: "a trick to get money or a confirmation before shipping",
  INVITE_REFUSED: "the seller refusing Pay Pals protection",
  CERT_MISMATCH: "a grading cert that does not match the card",
  MISSING_PACKING_PHOTO: "a shipment without the required packing photo",
  OTHER: "another concern",
};

const SYSTEM = [
  "You are the Buyer Pal in Pay Pals. You protect a buyer in a deal with a stranger on an online marketplace.",
  "Deterministic rules have already run. Their flags are fixed facts: they stay in the verdict exactly as given, you cannot remove or soften them, and you should not restate them as new flags.",
  "Your job: notice anything in the chat or on the card that the rules missed, raise a severity when the chat makes a flag worse, reword explanations in plain words a first-time buyer understands, list up to three questions for the seller, and write a short message to the buyer.",
  "A flag needs evidence that exists: quote the seller's words from the chat, or name the card field and its value. A missing answer, an unasked question or something you merely wish you knew is never a flag. It is a question for the seller.",
  "Say only what was examined. The photo block tells you which photos were read by the vision model; a caption is the seller's claim, not something you saw. The cert block tells you whether PSA was contacted; never say PSA's database was checked unless it says so.",
  "When the rules raised nothing and the price sits in the market range, the verdict is go unless the chat itself contains something the rules missed. Do not add a flag to justify caution.",
  "Questions for the seller: at most three, and prefer things the buyer can act on, such as a photo of a specific part, the serial, or a receipt. If the card already answers it, do not ask.",
  "For used electronics, proof that it powers on and a system or settings screen that shows the serial are fair things to ask for when the card does not show them (for a wearable, battery health). For a graded collectible, the cert check below is the proof; repeat its result in your message.",
  "A seller who refuses the Pay Pals invite or will only take Friends and Family has shown you the strongest scam sign there is. Say so plainly.",
  "Pay Pals only ever pays through a PayPal Goods and Services checkout. Any request to pay another way ends the deal.",
  "Writing rules: plain words, short sentences, no em dashes, no exclamation marks, no marketing voice. Say what to do next.",
].join("\n");

function transcript(chat: Message[]): string {
  return chat
    .filter((m) => m.channel === "deal")
    .map((m) => `${m.author}: ${m.text}${m.photos.length > 0 ? ` [photo: ${m.photos.map((p) => p.whatItShows).join("; ")}]` : ""}`)
    .join("\n");
}

/** The note the Channel3 lookup puts first in sources when a range was estimated or not checked. */
function priceNote(priceCheck: PriceCheck | null): string | null {
  const first = priceCheck?.sources[0];
  return first && first.price === undefined && first.url === undefined ? first.name : null;
}

/**
 * How many listings the range came from, by condition. Counts only, never a
 * shop: the retailer stays in the source's url and out of the model's sight.
 */
export function listingCounts(priceCheck: PriceCheck): string | null {
  const priced = priceCheck.sources.filter((s) => s.price !== undefined);
  if (priced.length === 0) return null;
  const byCondition = new Map<string, number>();
  for (const source of priced) {
    const key = (source.condition ?? "unstated").replace(/_/g, " ");
    byCondition.set(key, (byCondition.get(key) ?? 0) + 1);
  }
  const parts = [...byCondition.entries()].map(([condition, count]) => `${count} ${condition}`);
  return `from ${priced.length} listing${priced.length === 1 ? "" : "s"} (${parts.join(", ")})`;
}

/** The retailers behind the price check, from the source urls. Used only to keep them out of the pal's words. */
export function shopNames(priceCheck: PriceCheck | null): string[] {
  const names = new Set<string>();
  for (const source of priceCheck?.sources ?? []) {
    if (!source.url) continue;
    try {
      names.add(new URL(source.url).hostname.replace(/^www\./, "").toLowerCase());
    } catch {
      // Not a url we can parse; there is no retailer to hide.
    }
  }
  return [...names];
}

function priceLine(priceCheck: PriceCheck | null): string {
  if (!priceCheck || priceCheck.marketLow <= 0) {
    return `No reliable market price was found${priceNote(priceCheck) ? ` (${priceNote(priceCheck)!.toLowerCase()})` : ""}. Say so plainly; do not invent a range.`;
  }
  const note = priceNote(priceCheck);
  const counts = listingCounts(priceCheck);
  const reference = priceCheck.provider === "fixture" ? ` ${REFERENCE_RANGE_NOTE} Say that in your message.` : "";
  return `Market range $${priceCheck.marketLow} to $${priceCheck.marketHigh} (${priceCheck.provider}${counts ? `, ${counts}` : ""}${note ? `; ${note.toLowerCase()}` : ""}). Name no shop or website in your message; the buyer sees the listing count and the prices.${reference}`;
}

function certLine(card: ItemCard | null, certCheck: CertCheck | null, lookupFailed: boolean): string | null {
  if (!card?.certNumber) return null;
  if (!certCheck) return lookupFailed ? `Cert ${card.certNumber} could not be checked with the grader right now. Say so in your message.` : null;
  if (certCheck.matches === null) {
    return `Cert check (fixed fact): ${certCheck.explanation} PSA was not contacted. Say exactly that in your message; do not say PSA was checked, do not mention PSA's database, and do not say what PSA found.`;
  }
  const source = certCheck.record.provider === "psa" ? "PSA was contacted for this record." : "This is a demo record standing in for PSA, not a live lookup. Say demo record; never say PSA's database.";
  return `Cert check (fixed fact): ${certCheck.explanation} ${source}${certCheck.matches ? " Include the confirmation sentence in your message." : ""}`;
}

function fallbackQuestions(card: ItemCard | null, flags: RedFlag[]): string[] {
  if (!card || overallFromFlags(flags) === "stop") return [];
  const questions: string[] = [];
  if (!card.serial && !card.certNumber) questions.push("Please add a clear photo of the serial on the item itself.");
  if (flags.some((f) => f.code === "STOCK_OR_REUSED_PHOTO")) questions.push("Please add a photo of the actual item next to a note with today's date.");
  return questions;
}

function fallbackMessage(card: ItemCard | null, flags: RedFlag[], priceCheck: PriceCheck | null, certCheck: CertCheck | null, certLookupFailed: boolean): string {
  const overall = overallFromFlags(flags);
  const list = (f: RedFlag[]) => f.map((x) => FLAG_WORDS[x.code]).join(", ");
  const scope = card ? null : "I reviewed the chat only. There is no item card yet, so I could not check the price, the serial, the photos or a grading cert.";
  const certNote = certCheck
    ? certCheck.matches === null || certCheck.matches === true
      ? certCheck.explanation
      : null
    : certLookupFailed && card?.certNumber
      ? `I could not reach the grader to check cert ${card.certNumber}. Try again before you pay.`
      : null;
  const reference = card && priceCheck && priceCheck.marketLow > 0 && priceCheck.provider === "fixture" ? REFERENCE_RANGE_NOTE : null;
  if (overall === "stop") {
    const stops = flags.filter((f) => f.severity === "stop");
    const paymentFlag = stops.some((f) => f.code === "FRIENDS_AND_FAMILY_REQUEST" || f.code === "OFF_PLATFORM_PAYMENT" || f.code === "INVITE_REFUSED");
    return sentences(
      scope,
      `Stop. I found ${list(stops)}.`,
      stops.some((f) => f.code === "PRICE_FAR_BELOW_MARKET") ? reference : null,
      certNote,
      paymentFlag ? "Pay Pals only pays through a Goods and Services checkout, so this deal cannot go ahead." : "Do not pay for this.",
    );
  }
  if (overall === "caution") {
    return sentences(scope, `Caution. I found ${list(flags)}.`, certNote, "Get answers before you pay. I have listed what to ask the seller.");
  }
  const note = priceNote(priceCheck);
  return sentences(
    scope,
    card ? "This looks fair." : "Nothing in the chat worries me so far.",
    certNote,
    card && priceCheck && priceCheck.marketLow > 0
      ? `The asking price of $${card.askingPrice} sits within the market range of $${priceCheck.marketLow} to $${priceCheck.marketHigh}${note ? `, ${note.charAt(0).toLowerCase()}${note.slice(1)}` : ""}.`
      : null,
    reference,
    card && (!priceCheck || priceCheck.marketLow <= 0) ? `No reliable market price was found to compare the $${card.askingPrice} ask against${note ? ` (${note.toLowerCase()})` : ""}, so judge the price yourself.` : null,
    card?.serial ? `The serial ${card.serial} is on the card, so we can check it when the item arrives.` : null,
    card ? "Nothing in the chat worries me." : "I will check the price, the photos and the serial once the seller's card is in.",
  );
}

interface ModelPass {
  review: ModelReview | null;
  /** The model's message after the honesty check, or null when it has to be replaced by the rules-only text. */
  message: string | null;
}

/** One model call, then an honesty check on its message with one re-ask. */
async function askModel(client: ClaudeClient, content: Array<{ type: "text"; text: string }>, claims: ClaimContext): Promise<ModelPass> {
  const first = await callTool({ client, system: SYSTEM, content, tool: REVIEW_TOOL, schema: ModelReviewSchema });
  if (!first.value) return { review: null, message: null };
  const bad = unfoundedClaims(first.value.pal_message, claims);
  if (bad.length === 0) return { review: first.value, message: first.value.pal_message };
  const second = await callTool({ client, system: SYSTEM, content: [...content, { type: "text", text: reaskInstruction(bad, claims) }], tool: REVIEW_TOOL, schema: ModelReviewSchema });
  if (!second.value) return { review: first.value, message: null };
  const stillBad = unfoundedClaims(second.value.pal_message, claims);
  return { review: second.value, message: stillBad.length === 0 ? second.value.pal_message : null };
}

export async function reviewCard(card: ItemCard | null, chat: Message[], context: ReviewContext | undefined, deps: ReviewDeps): Promise<PalResult<Verdict>> {
  let priceCheck: PriceCheck | null = null;
  if (card) {
    try {
      const model = card.grade ? `${card.model} ${card.grade}` : card.model;
      priceCheck = await deps.priceLookup.priceRange({ brand: card.brand, model, condition: card.conditionGrade });
    } catch (error) {
      console.warn(`[pay-pals agents] price lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let certRecord: CertRecord | null = null;
  let certLookupFailed = false;
  if (card?.certNumber && deps.certLookup) {
    try {
      certRecord = await deps.certLookup.lookup(card.certNumber);
    } catch (error) {
      certLookupFailed = true;
      console.warn(`[pay-pals agents] cert lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const certCheck: CertCheck | null =
    card && certRecord ? (({ matches, explanation }) => ({ record: certRecord, matches, explanation }))(compareCertRecord(card, certRecord)) : null;

  let photoMatches: PhotoMatch[] = [];
  if (card && deps.photoMatch && deps.photoMatch.knownPhotos.length > 0) {
    try {
      photoMatches = await findReusedPhotos(card.photos, deps.photoMatch);
    } catch (error) {
      console.warn(`[pay-pals agents] photo match failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const ruleFlags = runRules({ card, chat, priceCheck, seller: context?.seller ?? null, certRecord, inviteDeclined: context?.inviteDeclined === true, photoMatches });

  let readings: PhotoReading[] = [];
  let pass: ModelPass = { review: null, message: null };
  if (deps.client) {
    if (card) {
      readings = await readPhotos(card.photos, { client: deps.client, fetchImage: deps.fetchImage, photoBaseUrl: deps.photoBaseUrl, hints: { brand: card.brand, model: card.model } });
    }
    const publicMode = deps.publicMode === true;
    const claims: ClaimContext = {
      imagesRead: readings.some((r) => r.imageStatus === "read"),
      psaContacted: certRecord?.provider === "psa",
      certCheck,
      publicMode,
      shops: shopNames(priceCheck),
    };
    const facts = ruleFlags.length === 0 ? "The rules raised no flags." : JSON.stringify(ruleFlags, null, 2);
    const cert = certLine(card, certCheck, certLookupFailed);
    pass = await askModel(
      deps.client,
      [
        {
          type: "text",
          text: card
            ? `Item card (version ${card.version}):\n${JSON.stringify(card, null, 2)}`
            : "There is no item card yet. The seller has not joined or has not uploaded anything. Review the chat only; price, serial, photos and cert cannot be checked.",
        },
        ...(card ? [{ type: "text" as const, text: photoFactsBlock(readings, publicMode) }] : []),
        { type: "text", text: `Shared chat, in order:\n${transcript(chat) || "(no messages yet)"}` },
        { type: "text", text: card ? priceLine(priceCheck) : "No price check without a card." },
        ...(cert ? [{ type: "text" as const, text: cert }] : []),
        { type: "text", text: `Fixed facts. Flags raised by the rules, which will appear in the verdict as given:\n${facts}` },
      ],
      claims,
    );
  }

  const review = pass.review;
  // Collapse again after the merge: the model may have added a payment code of its own.
  const flags = collapsePaymentFlags(mergeModelReview(ruleFlags, review, buildGroundingCorpus(card, chat)));
  const overall = overallFromFlags(flags);
  // The proof question is deterministic and comes first; the model's questions, or the rules-only ones, follow.
  const proof = overall === "stop" ? null : proofQuestion(card);
  const modelQuestions = review?.questions_for_seller ?? [];
  const questionsForSeller = pickQuestions(withProofQuestion(proof, modelQuestions.length > 0 ? modelQuestions : fallbackQuestions(card, flags)));
  const body = pass.message ? plainCopy(pass.message) : fallbackMessage(card, flags, priceCheck, certCheck, certLookupFailed);
  const palMessage = sentences(describeLooking(readings, "card photo", deps.publicMode === true), body);

  const verdict: Verdict = {
    dealId: card?.dealId ?? chat.find((m) => m.dealId.length > 0)?.dealId ?? "unknown",
    cardVersion: card?.version ?? 0,
    overall,
    flags,
    priceCheck,
    ...(certCheck ? { certCheck } : {}),
    questionsForSeller,
    palMessage,
    createdAt: new Date().toISOString(),
  };
  return { data: verdict, palMessage };
}
