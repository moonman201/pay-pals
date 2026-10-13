/**
 * SellerPal.applyRequest: a buyer's request plus the seller's reply become
 * the next card version. Structured fields change deterministically from the
 * reply; free-text fields get one plain sentence, written by Claude when
 * available and taken from the reply otherwise. Any photo the seller adds is
 * read for identifying numbers whatever field the buyer named. A locked card
 * throws.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { BuyerRequest, ItemCard, PalResult, Photo } from "@pay-pals/contracts";
import { isLocked } from "@pay-pals/contracts";
import { z } from "zod";
import type { ClaudeClient } from "../claude/client";
import { callTool } from "../claude/tool-call";
import { plainCopy, sentences } from "../copy";
import { certFromText, gradeFromText, normalizeSerial, serialFromText } from "../vision/description";
import type { ImageFetcher } from "../vision/fetch-image";
import { describeLooking, itemSerial, packagingSerial, readPhotos, type PhotoReading } from "../vision/read-photo";
import { parseConditionGrade, parseIncluded, parsePrice } from "./listing-parse";

export interface ApplyRequestDeps {
  client: ClaudeClient | null;
  fetchImage?: ImageFetcher;
  photoBaseUrl?: string | null;
  /** Presentation only: drop the sentences about photo files that could not be loaded. */
  publicMode?: boolean;
}

export class CardLockedError extends Error {
  constructor(card: ItemCard) {
    super(`Card version ${card.version} for deal ${card.dealId} is locked. Start a new deal to change it.`);
    this.name = "CardLockedError";
  }
}

const SentenceSchema = z.object({ sentence: z.string().transform((s) => s.trim().slice(0, 300)) });

const SENTENCE_TOOL: Anthropic.Tool = {
  name: "write_card_sentence",
  description: "Turn the seller's reply into one plain factual sentence for the item card.",
  input_schema: {
    type: "object",
    properties: { sentence: { type: "string", description: "One sentence, only facts the seller stated, no em dashes, no exclamation marks." } },
    required: ["sentence"],
    additionalProperties: false,
  },
};

function asSentence(text: string): string {
  const trimmed = plainCopy(text, 300).replace(/^added[.,]?\s*/i, "").trim();
  if (trimmed.length === 0) return "";
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

/**
 * What the buyer actually asked, or null when nobody did. A seller who edits
 * their own card unprompted has no buyer question, and the web app has sent a
 * stand-in string for that case ("Seller update"). A stand-in is not a quote,
 * so it never reaches the seller's message or the model.
 */
const PLACEHOLDER_REQUESTS = /^(?:seller update|seller edit|update|n\/a|none)\.?$/i;

export function buyerQuestion(request: BuyerRequest): string | null {
  const text = plainCopy(request.request ?? "", 200).trim();
  return text.length === 0 || PLACEHOLDER_REQUESTS.test(text) ? null : text;
}

/**
 * A sentence that says a photo was added, attached or shown. The card may say
 * so only when this update really carries a new photo (see cardSentence).
 */
const PHOTO_CLAIM =
  /\b(?:add(?:ed|ing)?|attach(?:ed|ing)?|includ(?:ed|ing)|sent|send(?:ing)?|upload(?:ed|ing)?|here(?:'s| is| are)|shows?|showing|see)\b[^.!?]{0,60}\b(?:photos?|pictures?|pics?|images?|close-?ups?|shots?)\b|\b(?:photos?|pictures?|pics?|images?|close-?ups?|shots?)\b[^.!?]{0,40}\b(?:added|attached|included|sent|uploaded|shows?|below|above)\b/i;

/** The seller's words with any sentence claiming a photo removed, and whether one was. */
export function withoutPhotoClaims(text: string): { kept: string; dropped: boolean } {
  const parts = text.split(/(?<=[.!?])\s+/);
  const kept = parts.filter((part) => !PHOTO_CLAIM.test(part));
  return { kept: kept.join(" ").trim(), dropped: kept.length !== parts.length };
}

/** The card states a seller's claim as the seller's own words, never as a fact in the pal's voice. */
function attribute(sentence: string): string {
  const bare = sentence.replace(/^(?:the )?seller says[:,]?\s*/i, "").trim();
  return bare.length === 0 ? "" : `Seller says: ${bare}`;
}

/**
 * One line for the card's condition notes from what the seller typed.
 *
 * The notes go onto the PayPal order, so they must not state more than the
 * update delivers. When there is no new photo, any sentence of the reply that
 * says one was added is dropped, on the keyless path and before the model
 * sees it, and a model sentence that says so anyway is replaced by the
 * keyless one. What stays is attributed ("Seller says: ...").
 */
async function cardSentence(
  request: BuyerRequest,
  reply: string,
  client: ClaudeClient | null,
  hasNewPhotos: boolean,
): Promise<{ sentence: string; droppedPhotoClaim: boolean }> {
  const { kept, dropped } = hasNewPhotos ? { kept: reply, dropped: false } : withoutPhotoClaims(reply);
  const fallback = attribute(asSentence(kept));
  const asked = buyerQuestion(request);
  if (!client || fallback.length === 0) return { sentence: fallback, droppedPhotoClaim: dropped };
  const result = await callTool({
    client,
    system:
      "You are the Seller Pal in Pay Pals. You write one plain sentence for an item card that reports what the seller says, using only what the seller said. Do not turn the seller's claim into a fact, and do not say a photo was added.",
    content: [
      {
        type: "text",
        text: `${asked ? `The buyer asked about ${request.field}: "${asked}"` : `The seller updated ${request.field} without being asked.`}\nThe seller replied: "${kept}"`,
      },
    ],
    tool: SENTENCE_TOOL,
    schema: SentenceSchema,
    maxTokens: 512,
  });
  const written = result.value?.sentence ? asSentence(result.value.sentence) : "";
  const usable = written.length > 0 && (hasNewPhotos || !PHOTO_CLAIM.test(written));
  return { sentence: usable ? attribute(written) : fallback, droppedPhotoClaim: dropped };
}

function appendNote(notes: string, sentence: string): string {
  if (sentence.length === 0 || notes.includes(sentence)) return notes;
  const joined = notes.length > 0 ? `${notes} ${sentence}` : sentence;
  return joined.length <= 600 ? joined : notes;
}

/**
 * Reads the identifying numbers off the photos the seller just added, the way
 * buildCard does: vision when the image loads, the caption when it does not.
 * This runs whatever field the buyer named, because a buyer who asks for a
 * close-up of the serial is asking for a photo, and the number on that photo
 * belongs on the card either way.
 *
 * Two rules it never breaks. A number read off packaging only ever fills
 * boxSerial, never the item serial. Nothing already on the card is replaced:
 * a photo that reads a different number is reported to the seller and the
 * card is left as it is.
 */
function numbersFromPhotos(next: ItemCard, readings: PhotoReading[], changes: string[], conflicts: string[]): void {
  const fromItem = itemSerial(readings);
  if (fromItem && !next.serial) {
    next.serial = fromItem.serial;
    changes.push(`serial ${fromItem.serial} read off the item`);
  } else if (fromItem && next.serial && normalizeSerial(fromItem.serial) !== normalizeSerial(next.serial)) {
    conflicts.push(`The new photo reads serial ${fromItem.serial} and the card says ${next.serial}, so I left the card as it is. Tell the buyer which unit this is.`);
  }

  const fromBox = packagingSerial(readings);
  if (fromBox && !next.boxSerial) {
    next.boxSerial = fromBox.serial;
    changes.push(`box label serial ${fromBox.serial} added`);
  }

  const labelText = readings.map((r) => r.photo.whatItShows).join("\n");
  const cert = certFromText(labelText);
  if (cert && !next.certNumber) {
    next.certNumber = cert;
    next.grade = gradeFromText(labelText);
    changes.push(`cert ${cert}${next.grade ? ` (${next.grade})` : ""} read off the label`);
  }
}

export async function applyBuyerRequest(
  card: ItemCard,
  request: BuyerRequest,
  sellerReply: string,
  newPhotos: Photo[] | undefined,
  deps: ApplyRequestDeps,
): Promise<PalResult<ItemCard>> {
  if (isLocked(card)) throw new CardLockedError(card);

  const next: ItemCard = { ...card, version: card.version + 1, lockedAt: null, photos: [...card.photos], included: [...card.included] };
  const changes: string[] = [];
  const conflicts: string[] = [];
  let droppedPhotoClaim = false;
  const photos = newPhotos ?? [];
  let readings: PhotoReading[] = [];
  if (photos.length > 0) {
    next.photos.push(...photos);
    changes.push(`${photos.length} photo${photos.length === 1 ? "" : "s"} added`);
    readings = await readPhotos(photos, { client: deps.client, fetchImage: deps.fetchImage, photoBaseUrl: deps.photoBaseUrl, hints: { brand: card.brand, model: card.model } });
    numbersFromPhotos(next, readings, changes, conflicts);
  }

  switch (request.field) {
    case "askingPrice": {
      const price = parsePrice(sellerReply);
      if (price !== null && price !== card.askingPrice) {
        next.askingPrice = price;
        changes.push(`price changed from $${card.askingPrice} to $${price}`);
      }
      break;
    }
    case "serial": {
      // The photos have already been read. What is left is a serial the seller typed out.
      const typed = serialFromText(sellerReply);
      if (typed && !next.serial) {
        next.serial = typed;
        changes.push(`serial ${typed} added`);
      } else if (typed && next.serial && normalizeSerial(typed) !== normalizeSerial(next.serial)) {
        conflicts.push(`You typed serial ${typed} and the card says ${next.serial}, so I left the card as it is.`);
      }
      break;
    }
    case "conditionGrade": {
      const grade = parseConditionGrade(sellerReply);
      if (grade && grade !== card.conditionGrade) {
        next.conditionGrade = grade;
        changes.push(`condition set to ${grade.replace("_", " ")}`);
      }
      const written = await cardSentence(request, sellerReply, deps.client, photos.length > 0);
      droppedPhotoClaim = droppedPhotoClaim || written.droppedPhotoClaim;
      next.conditionNotes = appendNote(next.conditionNotes, written.sentence);
      break;
    }
    case "included": {
      const items = parseIncluded(sellerReply).filter((item) => !next.included.some((i) => i.toLowerCase() === item.toLowerCase()));
      if (items.length > 0) {
        next.included.push(...items);
        changes.push(`included now lists ${items.join(", ")}`);
      }
      break;
    }
    case "title":
    case "brand":
    case "model": {
      const value = plainCopy(sellerReply, request.field === "title" ? 120 : request.field === "brand" ? 60 : 80);
      if (value.length > 0 && value !== card[request.field]) {
        next[request.field] = value;
        changes.push(`${request.field} changed to ${value}`);
      }
      break;
    }
    case "conditionNotes":
    case "photos": {
      const before = next.conditionNotes;
      const written = await cardSentence(request, sellerReply, deps.client, photos.length > 0);
      droppedPhotoClaim = droppedPhotoClaim || written.droppedPhotoClaim;
      next.conditionNotes = appendNote(next.conditionNotes, written.sentence);
      if (next.conditionNotes !== before) changes.push("condition notes updated");
      break;
    }
  }

  const asked = buyerQuestion(request);
  const palMessage = sentences(
    changes.length > 0 ? `I updated your card to version ${next.version}: ${changes.join(", ")}.` : `Your card is still version ${card.version}. I could not find a change in your reply for ${request.field}.`,
    describeLooking(readings, "photo", deps.publicMode === true),
    ...conflicts,
    droppedPhotoClaim ? "You wrote that a photo was added, but no photo came with this update, so I left that out of the card. Add the photo if you want it on the card." : null,
    asked ? `This answers the buyer's question: "${asked}"` : null,
    "The buyer's pal will see the new version.",
  );
  return { data: next, palMessage };
}
