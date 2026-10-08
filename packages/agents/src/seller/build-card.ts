/**
 * SellerPal.buildCard: a pasted listing, notes and photos become card
 * version 1. Claude drafts the descriptive fields from the seller's words;
 * the serial comes only from a photo read or from text the seller typed.
 * The model never gets to fill in a serial.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { BuildCardInput, ItemCard, PalResult } from "@pay-pals/contracts";
import { CONDITION_GRADES } from "@pay-pals/contracts";
import { z } from "zod";
import type { ClaudeClient } from "../claude/client";
import { callTool } from "../claude/tool-call";
import { sentences } from "../copy";
import { certFromText, gradeFromText, normalizeSerial, serialFromText } from "../vision/description";
import type { ImageFetcher } from "../vision/fetch-image";
import { describeLooking, itemSerial, packagingSerial, readPhotos } from "../vision/read-photo";
import { parseListing, type ListingDraft } from "./listing-parse";

export interface BuildCardDeps {
  client: ClaudeClient | null;
  fetchImage?: ImageFetcher;
  photoBaseUrl?: string | null;
}

export class MissingPriceError extends Error {
  constructor() {
    super("No asking price found in the listing or notes and none was typed. Ask the seller for a price before building the card.");
    this.name = "MissingPriceError";
  }
}

/** The listing's own price wins; the seller's typed price fills in when the listing names none. */
export function resolveAskingPrice(fromListing: number | null, typed: number | undefined): number | null {
  if (fromListing !== null) return fromListing;
  if (typeof typed === "number" && Number.isFinite(typed) && typed > 0) return Math.round(typed * 100) / 100;
  return null;
}

const clip = (max: number) => z.string().transform((s) => s.trim().slice(0, max));

const DraftSchema = z.object({
  title: clip(120),
  brand: clip(60),
  model: clip(80),
  condition_grade: z.enum(CONDITION_GRADES),
  condition_notes: clip(600),
  included: z.array(clip(80)).max(12),
  asking_price: z.number().positive().nullable(),
});

const DRAFT_TOOL: Anthropic.Tool = {
  name: "draft_item_card",
  description: "Draft the item card fields from the seller's listing and notes. Use only what the seller wrote. The serial number is handled separately; never include one.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Brand and model in a short line, up to 120 characters." },
      brand: { type: "string" },
      model: { type: "string", description: "Model name with variant and size when the seller gave them." },
      condition_grade: { type: "string", enum: [...CONDITION_GRADES] },
      condition_notes: { type: "string", description: "The seller's own condition claims as one or two plain sentences. Flaws first. Up to 600 characters." },
      included: { type: "array", items: { type: "string" }, description: "What comes in the box, one short item each." },
      asking_price: { type: ["number", "null"], description: "Asking price in US dollars, or null if the listing names none." },
    },
    required: ["title", "brand", "model", "condition_grade", "condition_notes", "included", "asking_price"],
    additionalProperties: false,
  },
};

const SYSTEM = [
  "You are the Seller Pal in Pay Pals. You turn a seller's pasted listing into a precise item card that will become the description on a PayPal checkout order.",
  "Copy facts, do not invent them. If the seller did not state something, leave it out. Keep marketing words out of the card.",
  "Write in plain words with no em dashes and no exclamation marks.",
].join("\n");

async function draftFields(input: BuildCardInput, client: ClaudeClient | null): Promise<ListingDraft> {
  const fallback = parseListing(input.listingText, input.sellerNotes);
  if (!client) return fallback;
  const result = await callTool({
    client,
    system: SYSTEM,
    content: [
      { type: "text", text: `Listing text:\n${input.listingText}` },
      { type: "text", text: `Seller's notes:\n${input.sellerNotes || "(none)"}` },
      { type: "text", text: `Photos the seller attached:\n${input.photos.map((p) => `- ${p.whatItShows}`).join("\n") || "(none)"}` },
    ],
    tool: DRAFT_TOOL,
    schema: DraftSchema,
    maxTokens: 2048,
  });
  const draft = result.value;
  if (!draft) return fallback;
  return {
    title: draft.title || fallback.title,
    brand: draft.brand || fallback.brand,
    model: draft.model || fallback.model,
    conditionGrade: draft.condition_grade,
    conditionNotes: draft.condition_notes,
    included: draft.included.filter((s) => s.length > 0),
    askingPrice: draft.asking_price ?? fallback.askingPrice,
  };
}

export async function buildCardFromListing(input: BuildCardInput, deps: BuildCardDeps): Promise<PalResult<ItemCard>> {
  const fields = await draftFields(input, deps.client);
  const askingPrice = resolveAskingPrice(fields.askingPrice, input.askingPrice);
  if (askingPrice === null) throw new MissingPriceError();

  const readings = await readPhotos(input.photos, {
    client: deps.client,
    fetchImage: deps.fetchImage,
    photoBaseUrl: deps.photoBaseUrl,
    hints: { brand: fields.brand, model: fields.model },
  });
  // The item's own serial and the box label's serial are read separately. The box never fills in for the item.
  const fromPhoto = itemSerial(readings);
  const fromBox = packagingSerial(readings);
  const typedSerial = serialFromText(`${input.listingText}\n${input.sellerNotes}`);
  const serial = fromPhoto?.serial ?? typedSerial;
  const boxSerial = fromBox?.serial ?? null;
  const serialsMatch = serial && boxSerial ? normalizeSerial(serial) === normalizeSerial(boxSerial) : null;
  // A graded collectible is identified by its cert number and grade, read from the slab label text or the listing.
  const labelText = [...input.photos.map((p) => p.whatItShows), input.listingText, input.sellerNotes].join("\n");
  const certNumber = certFromText(labelText);
  const grade = gradeFromText(labelText);

  const card: ItemCard = {
    dealId: input.dealId,
    version: 1,
    title: fields.title,
    brand: fields.brand,
    model: fields.model,
    serial,
    boxSerial,
    ...(certNumber ? { certNumber, grade } : {}),
    conditionGrade: fields.conditionGrade,
    conditionNotes: fields.conditionNotes,
    included: fields.included,
    photos: input.photos,
    askingPrice: Math.round(askingPrice * 100) / 100,
    currency: "USD",
    sellerPaypalEmail: input.sellerPaypalEmail,
    lockedAt: null,
  };

  const palMessage = sentences(
    `I built card version 1 for the ${card.title} at $${card.askingPrice}.`,
    describeLooking(readings, "photo"),
    fromPhoto ? `Serial ${serial} read from the item (${fromPhoto.reading.photo.whatItShows}).` : null,
    !fromPhoto && typedSerial ? `Serial ${serial} taken from your notes. A photo of it on the item would make the card stronger.` : null,
    serialsMatch === true ? `The box label shows the same serial. They match.` : null,
    serialsMatch === false ? `The box label reads ${boxSerial}, which does not match the item. Say why before you share the card, because the buyer's pal will raise it.` : null,
    certNumber ? `Cert ${certNumber}${grade ? ` (${grade})` : ""} read from the slab label. The buyer's pal will check it with the grader.` : null,
    !serial && boxSerial ? `The only serial I found is on the box label (${boxSerial}). A box label is not the item. Add a photo of the serial on the item itself.` : null,
    !serial && !boxSerial && !certNumber ? "I could not find a serial number in the photos. Add a clear photo of the serial on the item itself before you share the card." : null,
    "Check every line before you share it. Once the buyer agrees, this card becomes the PayPal order.",
  );
  return { data: card, palMessage };
}
