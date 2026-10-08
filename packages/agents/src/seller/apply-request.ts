/**
 * SellerPal.applyRequest: a buyer's request plus the seller's reply become
 * the next card version. Structured fields change deterministically from the
 * reply; free-text fields get one plain sentence, written by Claude when
 * available and taken from the reply otherwise. A locked card throws.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { BuyerRequest, ItemCard, PalResult, Photo } from "@pay-pals/contracts";
import { isLocked } from "@pay-pals/contracts";
import { z } from "zod";
import type { ClaudeClient } from "../claude/client";
import { callTool } from "../claude/tool-call";
import { plainCopy, sentences } from "../copy";
import { serialFromText } from "../vision/description";
import type { ImageFetcher } from "../vision/fetch-image";
import { itemSerial, readPhotos } from "../vision/read-photo";
import { parseConditionGrade, parseIncluded, parsePrice } from "./listing-parse";

export interface ApplyRequestDeps {
  client: ClaudeClient | null;
  fetchImage?: ImageFetcher;
  photoBaseUrl?: string | null;
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

async function cardSentence(request: BuyerRequest, reply: string, client: ClaudeClient | null): Promise<string> {
  const fallback = asSentence(reply);
  if (!client || fallback.length === 0) return fallback;
  const result = await callTool({
    client,
    system: "You are the Seller Pal in Pay Pals. You write one plain sentence of fact for an item card, using only what the seller said.",
    content: [{ type: "text", text: `The buyer asked about ${request.field}: "${request.request}"\nThe seller replied: "${reply}"` }],
    tool: SENTENCE_TOOL,
    schema: SentenceSchema,
    maxTokens: 512,
  });
  return result.value?.sentence ? asSentence(result.value.sentence) : fallback;
}

function appendNote(notes: string, sentence: string): string {
  if (sentence.length === 0 || notes.includes(sentence)) return notes;
  const joined = notes.length > 0 ? `${notes} ${sentence}` : sentence;
  return joined.length <= 600 ? joined : notes;
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
  const photos = newPhotos ?? [];
  if (photos.length > 0) {
    next.photos.push(...photos);
    changes.push(`${photos.length} photo${photos.length === 1 ? "" : "s"} added`);
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
      const readings = await readPhotos(photos, { client: deps.client, fetchImage: deps.fetchImage, photoBaseUrl: deps.photoBaseUrl, hints: { brand: card.brand, model: card.model } });
      const serial = itemSerial(readings)?.serial ?? serialFromText(sellerReply);
      if (serial && serial !== card.serial) {
        next.serial = serial;
        changes.push(`serial ${serial} added`);
      }
      break;
    }
    case "conditionGrade": {
      const grade = parseConditionGrade(sellerReply);
      if (grade && grade !== card.conditionGrade) {
        next.conditionGrade = grade;
        changes.push(`condition set to ${grade.replace("_", " ")}`);
      }
      next.conditionNotes = appendNote(next.conditionNotes, await cardSentence(request, sellerReply, deps.client));
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
      next.conditionNotes = appendNote(next.conditionNotes, await cardSentence(request, sellerReply, deps.client));
      if (next.conditionNotes !== before) changes.push("condition notes updated");
      break;
    }
  }

  const palMessage = sentences(
    changes.length > 0 ? `Card version ${next.version}: ${changes.join(", ")}.` : `Card version ${next.version} is the same as before. I could not find a change in your reply for ${request.field}.`,
    `The buyer asked: "${plainCopy(request.request, 200)}"`,
    "The buyer's pal will see the new version.",
  );
  return { data: next, palMessage };
}
