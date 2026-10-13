/**
 * BuyerPal.review: the price check, the cert lookup, the photo reads and the
 * reused-photo check run together (see gather.ts), then the rules, then one
 * Claude call for judgment and plain words. Findings are reported as they
 * land when the caller passes onProgress (see progress.ts). The rules decide what is a flag;
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
  ReviewOptions,
  Verdict,
} from "@pay-pals/contracts";
import { compareCertRecord } from "../cert/compare";
import { gatherCert, gatherPhotoMatches, gatherPhotoReads, gatherPrice } from "./gather";
import { emitter, flagReporter } from "./progress";
import type { ClaudeClient } from "../claude/client";
import { callTool } from "../claude/tool-call";
import { plainCopy, sentences } from "../copy";
import { collapsePaymentFlags, overallFromFlags, runRules } from "../rules";
import type { ImageFetcher } from "../vision/fetch-image";
import { describeLooking } from "../vision/read-photo";
import { reaskInstruction, unfoundedClaims, type ClaimContext } from "./claim-check";
import { buildGroundingCorpus } from "./grounding";
import { mergeModelReview } from "./merge-flags";
import { photoFactsBlock } from "./photo-facts";
import type { PhotoMatchDeps } from "./photo-match";
import { BOX_LABEL_CLOSE_UP_QUESTION, datedNoteQuestion, serialCloseUpQuestion, withProofQuestions } from "./proof-question";
import { mergeReasoning } from "./reasoning";
import { nearMissSerials, reviewReasoning } from "./review-reasons";
import { ModelReviewSchema, REVIEW_TOOL, type ModelReview } from "./review-tool";
import { chatNote, verdictMessage } from "./verdict-message";

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
  STOCK_OR_REUSED_PHOTO: "a photo that is the same picture as one Pay Pals already holds",
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
  "Your job: notice anything in the chat or on the card that the rules missed, raise a severity when the chat makes a flag worse, reword a flag's explanation in plainer words, list up to three questions for the seller, and add to the pal's reasons.",
  "You do not write the message the buyer reads. It is built from the flags and the reasons, so a flag explanation IS a line the buyer sees: keep each one to about twelve words, one fact, plain words, no preamble.",
  "A flag needs evidence that exists: quote the seller's words from the chat, or name the card field and its value. A missing answer, an unasked question or something you merely wish you knew is never a flag. It is a question for the seller.",
  "Say only what was examined. The photo block tells you which photos were read by the vision model; a caption is the seller's claim, not something you saw. The cert block tells you whether PSA was contacted; never say PSA's database was checked unless it says so.",
  "When the rules raised nothing and the price sits in the market range, the verdict is go unless the chat itself contains something the rules missed. Do not add a flag to justify caution.",
  "Questions for the seller: at most three, and prefer things the buyer can act on, such as a photo of a specific part, the serial, or a receipt. If the card already answers it, do not ask.",
  "For used electronics, a close-up of the serial label on the item itself is a fair thing to ask for when the card has no serial of its own; a serial on the box is not the item's serial.",
  "For a graded item, a cert that matches means the grader has a record for that slab. It does not mean this seller is holding it, and it says nothing about the seller. Say both halves. The photo that settles it is the slab next to a handwritten note with the seller's name and today's date. Never write the words verified or authentic.",
  "A serial that matches, or a cert that matches, supports what the listing says. It never proves who owns the item and it never proves the item is authentic. Say what was checked and against what.",
  "A seller who refuses the Pay Pals invite or will only take Friends and Family has given the buyer a risk signal. Say that plainly. Never call it the strongest sign and never call it proof of fraud.",
  // Without this the model rebuilds the overclaim from the flag's own name, which contains the
  // word STOCK. The tamper sentence was put back by its prompt in exactly this way on Oct 10.
  "STOCK_OR_REUSED_PHOTO means a card photo is the same picture as one in Pay Pals' own set of reference pictures. Pay Pals does not search the web and has no way to know where else a picture appears. Never say a photo was found on another listing, found online, taken from the internet or traced anywhere. Say it is a picture Pay Pals already holds, so the buyer has not been shown the seller's own item, and say the check was against our own set.",
  "If you mention the evidence pack, it is useful context for a PayPal dispute. Never promise or predict what a dispute will decide, and never say a refund or a dispute requires the pack or the history hash.",
  "Pay Pals only ever pays through a PayPal Goods and Services checkout. Any request to pay another way ends the deal.",
  "Writing rules: plain words, short sentences, no em dashes, no exclamation marks, no marketing voice. Prefer the everyday word over the technical one: say the deal history rather than the hash chain, and a picture we hold rather than a perceptual match.",
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
  // New first, then used, then anything else, so the line reads the same whatever order the listings arrived in.
  const rank = (condition: string): number => (condition === "new" ? 0 : condition === "used" ? 1 : 2);
  const parts = [...byCondition.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([condition, count]) => `${count} ${condition}`);
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

function priceLine(priceCheck: PriceCheck | null, card: ItemCard | null): string {
  if (!priceCheck || priceCheck.marketLow <= 0) {
    // A graded card has no comps in our price source at all, so "none found" would read as a
    // failed lookup rather than a check that cannot be made. Say which it is, and never let the
    // model imply a graded comp exists somewhere.
    const graded = card?.certNumber
      ? " This is a graded card, and the price source covers retail stores rather than graded cards, so there is no automatic check to make. Say that, and never suggest a graded comparison exists."
      : "";
    return `No market price came back${priceNote(priceCheck) ? ` (${priceNote(priceCheck)!.toLowerCase()})` : ""}. Say so plainly; do not invent a range.${graded}`;
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
  const matched = certCheck.matches
    ? " Put that sentence in your message, both halves of it: the record matches the card, and that does not show this seller has the slab."
    : "";
  return `Cert check (fixed fact): ${certCheck.explanation} ${source}${matched}`;
}

function fallbackQuestions(card: ItemCard | null, flags: RedFlag[]): string[] {
  if (!card || overallFromFlags(flags) === "stop") return [];
  const questions: string[] = [];
  if (flags.some((f) => f.code === "STOCK_OR_REUSED_PHOTO")) questions.push("Please add a photo of the item itself, in your own hands, taken today.");
  return questions;
}


/**
 * One model call, then an honesty check on everything it wrote, with one
 * re-ask when something cannot be supported.
 *
 * The review a buyer reads is now a verdict, three reason lines and one
 * closing line, built from the flags and the reasons (verdict-message.ts), so
 * there is no longer a slot for a paragraph of model prose and the model no
 * longer writes one. What it still writes is reason lines and reworded flag
 * explanations, and those go through the same check the paragraph did: a line
 * claiming a check that did not happen gets the call made again with the
 * offending phrases named, exactly as before.
 */
async function askModel(client: ClaudeClient, content: Array<{ type: "text"; text: string }>, claims: ClaimContext): Promise<ModelReview | null> {
  const first = await callTool({ client, system: SYSTEM, content, tool: REVIEW_TOOL, schema: ModelReviewSchema });
  if (!first.value) return null;
  const bad = modelClaims(first.value).flatMap((text) => unfoundedClaims(text, claims));
  if (bad.length === 0) return first.value;
  const second = await callTool({ client, system: SYSTEM, content: [...content, { type: "text", text: reaskInstruction([...new Set(bad)], claims) }], tool: REVIEW_TOOL, schema: ModelReviewSchema });
  return second.value ?? first.value;
}

/** Every string the model wrote that a human will read, for the honesty check. */
function modelClaims(review: ModelReview): string[] {
  return [
    ...review.explanations.map((e) => e.explanation),
    ...review.additional_flags.map((f) => f.explanation),
    ...review.questions_for_seller,
    ...review.reasoning.checked,
    ...review.reasoning.found,
    ...review.reasoning.could_not_verify,
    ...review.reasoning.would_change_my_mind,
  ];
}

/**
 * What the market lookup is asked for. Brand, model and condition only, so
 * two cards describing the same item ask the same question and get the same
 * range. The grade joins the model for a graded item, because a PSA 10 and a
 * PSA 8 of one card are not the same market.
 */
export function priceQuery(card: ItemCard): { brand: string; model: string; condition: string } {
  return { brand: card.brand, model: card.grade ? `${card.model} ${card.grade}` : card.model, condition: card.conditionGrade };
}

export async function reviewCard(
  card: ItemCard | null,
  chat: Message[],
  context: ReviewContext | undefined,
  deps: ReviewDeps,
  options?: ReviewOptions,
): Promise<PalResult<Verdict>> {
  const emit = emitter(options?.onProgress);
  const reportFlags = flagReporter(emit);

  // The four lookups do not depend on each other, so they run together. Each swallows its own
  // failure and reports itself as it lands, so one slow or broken lookup neither holds the others
  // up nor fails the review. The model call cannot join them: it is told what all four found.
  const [price, cert, matches, readings] = await Promise.all([
    gatherPrice(card, deps.priceLookup, priceQuery, emit),
    gatherCert(card, deps.certLookup, emit),
    gatherPhotoMatches(card, deps.photoMatch, emit),
    gatherPhotoReads(card, { client: deps.client, fetchImage: deps.fetchImage, photoBaseUrl: deps.photoBaseUrl }, emit),
  ]);

  const priceCheck = price.priceCheck;
  const certRecord = cert.certRecord;
  const certLookupFailed = cert.lookupFailed;
  const photoMatches = matches.photoMatches;
  const photoMatchRan = matches.ran;
  const certCheck: CertCheck | null =
    card && certRecord ? (({ matches: m, explanation }) => ({ record: certRecord, matches: m, explanation }))(compareCertRecord(card, certRecord)) : null;
  if (certCheck) emit({ kind: "certCheck", certCheck });

  let review: ModelReview | null = null;
  const publicMode = deps.publicMode === true;
  // The box-serial rule has to know whether a vision read is in play before it can decide that a
  // one-character difference is a mismatch, which is why the reads are gathered before the rules.
  const serialReadFromPhoto = readings.some((r) => r.source === "vision" && r.serial !== null);

  emit({ kind: "stage", stage: "checking the chat for the patterns Pay Pals knows" });
  const ruleFlags = runRules({
    card,
    chat,
    priceCheck,
    seller: context?.seller ?? null,
    certRecord,
    inviteDeclined: context?.inviteDeclined === true,
    photoMatches,
    serialReadFromPhoto,
  });
  // The rules' findings go out now, not at the end. Every one of them is in the final verdict:
  // merge-flags.ts keeps each rule flag with its code, only ever raises a severity, and the one
  // thing that drops a flag, collapsePaymentFlags, only ever drops a model-added one. See
  // progress.ts. A stop reaching the page the moment it is raised is the point of the exercise.
  reportFlags(ruleFlags);

  // Built whether or not a model ran, because the reasons go through the same honesty check the message does.
  const claims: ClaimContext = {
    imagesRead: readings.some((r) => r.imageStatus === "read"),
    psaContacted: certRecord?.provider === "psa",
    certCheck,
    publicMode,
    shops: shopNames(priceCheck),
  };
  const reasonInput = {
    card,
    priceCheck,
    certCheck,
    certLookupFailed,
    readings,
    seller: context?.seller ?? null,
    photoMatchRan,
    photoMatches,
    modelAvailable: deps.client !== null,
    serialReadFromPhoto,
  };
  if (deps.client) {
    emit({ kind: "stage", stage: "asking the pal to weigh it all up" });
    const facts = ruleFlags.length === 0 ? "The rules raised no flags." : JSON.stringify(ruleFlags, null, 2);
    const cert = certLine(card, certCheck, certLookupFailed);
    const already = reviewReasoning({ ...reasonInput, flags: ruleFlags, overall: overallFromFlags(ruleFlags) });
    review = await askModel(
      deps.client,
      [
        {
          type: "text",
          text: card
            ? `Item card (version ${card.version}):\n${JSON.stringify(card, null, 2)}`
            : "There is no item card yet. The seller has not joined or has not uploaded anything. Review the chat only; price, serial, photos and cert cannot be checked.",
        },
        ...(card ? [{ type: "text" as const, text: photoFactsBlock(readings, publicMode, card) }] : []),
        { type: "text", text: `Shared chat, in order:\n${transcript(chat) || "(no messages yet)"}` },
        { type: "text", text: card ? priceLine(priceCheck, card) : "No price check without a card." },
        ...(cert ? [{ type: "text" as const, text: cert }] : []),
        { type: "text", text: `Fixed facts. Flags raised by the rules, which will appear in the verdict as given:\n${facts}` },
        {
          type: "text",
          text: `Fixed facts. Reasons already worked out, which will appear as given. Add to them only where you have something they do not say, and do not repeat one in other words:\n${JSON.stringify(already, null, 2)}`,
        },
      ],
      claims,
    );
  }

  // Collapse again after the merge: the model may have added a payment code of its own.
  const flags = collapsePaymentFlags(mergeModelReview(ruleFlags, review, buildGroundingCorpus(card, chat)));
  const overall = overallFromFlags(flags);
  // Anything the model added goes out only now, after the collapse, so what was reported is
  // exactly what the verdict holds. Sending one earlier could report a payment flag the collapse
  // then folds into the rule's. The reporter skips codes already sent.
  reportFlags(flags);
  // Our own questions are deterministic and come first; the model's, or the rules-only ones, follow.
  // The dated-note ask stands even on a stop: it is the one answer that would change the verdict.
  const ours = [
    datedNoteQuestion(card),
    // The band claimed neither, so the one photo that would settle it is asked for.
    nearMissSerials(card, serialReadFromPhoto) ? BOX_LABEL_CLOSE_UP_QUESTION : null,
    overall === "stop" ? null : serialCloseUpQuestion(card),
  ];
  const modelQuestions = review?.questions_for_seller ?? [];
  const questionsForSeller = pickQuestions(withProofQuestions(ours, modelQuestions.length > 0 ? modelQuestions : fallbackQuestions(card, flags)));
  // The rules' reasons are fixed facts, like their flags. The model may add to a group and never take from one.
  const reasoning = mergeReasoning(reviewReasoning({ ...reasonInput, flags, overall }), review?.reasoning ?? null, claims);

  // The review a buyer reads: a verdict, one line per reason, one line saying what would change it.
  // Built from the flags and the reasons rather than from prose, so nothing is said twice and the
  // model cannot pad it. See verdict-message.ts for the shape and why wouldChangeMyMind moved here.
  const palMessage = verdictMessage({
    overall,
    flags,
    askingPrice: card?.askingPrice ?? null,
    priceCheck,
    serial: card?.serial ?? null,
    wouldChangeMyMind: reasoning.wouldChangeMyMind,
    scope: card ? null : "No item card yet, so this is the chat only.",
    openQuestions: questionsForSeller.length,
  });

  const verdict: Verdict = {
    dealId: card?.dealId ?? chat.find((m) => m.dealId.length > 0)?.dealId ?? "unknown",
    cardVersion: card?.version ?? 0,
    overall,
    flags,
    priceCheck,
    ...(certCheck ? { certCheck } : {}),
    questionsForSeller,
    palMessage,
    reasoning,
    createdAt: new Date().toISOString(),
  };
  // The verdict carries the review the room renders; the result carries the line for the buyer's
  // private pal chat. apps/web posts the second into that channel, so returning the review for
  // both printed the whole thing twice on one page.
  return { data: verdict, palMessage: chatNote(overall, questionsForSeller.length) };
}
