/**
 * Reads brand, model and serial from one photo, and notes where the serial is
 * printed: on the item itself or on a box, label or packaging. A packaging
 * serial never stands in for the item's own serial. Uses Claude vision when
 * the image can be loaded and a client is available; otherwise falls back to
 * the seller's or buyer's own description of the photo, and the reading says
 * which happened so the pal message can say what it looked at.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { Photo } from "@pay-pals/contracts";
import { z } from "zod";
import type { ClaudeClient } from "../claude/client";
import { callTool } from "../claude/tool-call";
import { brandFromText, isPackagingDescription, modelFromText, normalizeSerial, saysItemMissing, serialFromText } from "./description";
import { fetchImage as defaultFetchImage, loadPhoto, type ImageFetcher } from "./fetch-image";

export type SerialLocation = "item" | "packaging";

/** read: Claude looked at the image. not_loaded: the file could not be fetched. no_model: no client. model_failed: the image loaded but the model gave no answer. */
export type ImageStatus = "read" | "not_loaded" | "no_model" | "model_failed";

export interface PhotoReading {
  photo: Photo;
  brand: string | null;
  model: string | null;
  serial: string | null;
  /** Where the serial is printed. Null when no serial was read. */
  serialOn: SerialLocation | null;
  /** False when the photo shows the item is not there (an empty box). Null when the photo does not say. */
  itemPresent: boolean | null;
  /** vision: Claude looked at the image. description: we parsed whatItShows. */
  source: "vision" | "description";
  imageStatus: ImageStatus;
}

export interface ReadPhotoDeps {
  client: ClaudeClient | null;
  fetchImage?: ImageFetcher;
  /** Base URL for app-relative photo paths. */
  photoBaseUrl?: string | null;
  /** What the card says, so description parsing knows which product family to look for. */
  hints?: { brand?: string; model?: string };
}

const ReadingSchema = z.object({
  brand: z.string().nullable(),
  model: z.string().nullable(),
  serial: z.string().nullable(),
  serial_on: z.enum(["item", "packaging"]).nullable(),
  item_present: z.boolean().nullable(),
});

const READING_TOOL: Anthropic.Tool = {
  name: "report_photo_reading",
  description: "Report exactly what is legibly printed or shown in the photo. Use null for anything you cannot read with confidence.",
  input_schema: {
    type: "object",
    properties: {
      brand: { type: ["string", "null"], description: "Brand name as printed, or null." },
      model: { type: ["string", "null"], description: "Model name or number as printed or clearly identifiable, or null." },
      serial: { type: ["string", "null"], description: "The full serial number exactly as printed, or null if any character is unclear." },
      serial_on: {
        type: ["string", "null"],
        enum: ["item", "packaging", null],
        description: "Where that serial is printed: on the item itself (its back, underside or a system screen) or on a box, label or packaging. Null when no serial.",
      },
      item_present: {
        type: ["boolean", "null"],
        description: "True when the item itself is visible, false when the photo shows it is not there (an empty box or just packaging), null when unclear.",
      },
    },
    required: ["brand", "model", "serial", "serial_on", "item_present"],
    additionalProperties: false,
  },
};

const SYSTEM = [
  "You read product photos for a deal between two strangers.",
  "Report only what you can actually see. A serial number must be copied character for character; if any part is unclear, return null for the serial.",
  "Say where the serial is printed. A serial on a box, label or packaging is not the item's serial.",
  "Say whether the item itself is in the picture. A box with only packing foam inside means the item is not present.",
  "Never guess, never complete a partial serial, never infer a serial from the description.",
].join(" ");

function fromDescription(photo: Photo, hints: ReadPhotoDeps["hints"], imageStatus: ImageStatus): PhotoReading {
  const text = photo.whatItShows;
  const serial = serialFromText(text);
  return {
    photo,
    brand: hints?.brand ? brandFromText(text, hints.brand) : null,
    model: hints?.model ? modelFromText(text, hints.model) : null,
    serial,
    serialOn: serial ? (isPackagingDescription(text) ? "packaging" : "item") : null,
    itemPresent: saysItemMissing(text) ? false : null,
    source: "description",
    imageStatus,
  };
}

export async function readPhoto(photo: Photo, deps: ReadPhotoDeps): Promise<PhotoReading> {
  if (!deps.client) return fromDescription(photo, deps.hints, "no_model");
  const image = await loadPhoto(photo.url, deps.fetchImage ?? defaultFetchImage, deps.photoBaseUrl);
  if (!image) return fromDescription(photo, deps.hints, "not_loaded");

  const hintText = deps.hints?.model ? `The deal card describes the item as ${deps.hints.brand ?? ""} ${deps.hints.model}. Do not let that influence what you read.` : "";
  const result = await callTool({
    client: deps.client,
    system: SYSTEM,
    content: [
      { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
      { type: "text", text: `The person who uploaded this says it shows: "${photo.whatItShows}". ${hintText}`.trim() },
    ],
    tool: READING_TOOL,
    schema: ReadingSchema,
    maxTokens: 1024,
  });
  if (!result.value) return fromDescription(photo, deps.hints, "model_failed");
  const serial = result.value.serial ? normalizeSerial(result.value.serial) || null : null;
  return {
    photo,
    brand: result.value.brand?.trim() || null,
    model: result.value.model?.trim() || null,
    serial,
    serialOn: serial ? (result.value.serial_on ?? (isPackagingDescription(photo.whatItShows) ? "packaging" : "item")) : null,
    itemPresent: result.value.item_present ?? (saysItemMissing(photo.whatItShows) ? false : null),
    source: "vision",
    imageStatus: "read",
  };
}

export async function readPhotos(photos: Photo[], deps: ReadPhotoDeps): Promise<PhotoReading[]> {
  const readings: PhotoReading[] = [];
  for (const photo of photos) readings.push(await readPhoto(photo, deps));
  return readings;
}

/** One plain sentence on what was looked at. Empty when there were no photos. */
export function describeLooking(readings: PhotoReading[], noun: string): string | null {
  const n = readings.length;
  if (n === 0) return null;
  const plural = (count: number) => (count === 1 ? noun : `${noun}s`);
  const read = readings.filter((r) => r.imageStatus === "read").length;
  const notLoaded = readings.filter((r) => r.imageStatus === "not_loaded").length;
  const failed = readings.filter((r) => r.imageStatus === "model_failed").length;
  if (readings.every((r) => r.imageStatus === "no_model")) {
    return `The vision model was not available, so this check used the ${plural(n)}'s description${n === 1 ? "" : "s"}.`.replace(`${noun}s's`, `${noun}s'`);
  }
  const parts: string[] = [];
  if (read > 0) parts.push(read === n ? `I looked at the ${n === 1 ? noun : `${n} ${noun}s`}.` : `I looked at ${read} of the ${n} ${noun}s.`);
  if (notLoaded > 0) {
    parts.push(
      notLoaded === n && n === 1
        ? `The ${noun} could not be loaded, so this check used the photo description.`
        : `${notLoaded} of the ${n} ${noun}s could not be loaded, so this check used the photo description${notLoaded === 1 ? "" : "s"} for ${notLoaded === 1 ? "it" : "those"}.`,
    );
  }
  if (failed > 0) parts.push(`The vision model gave no answer for ${failed === 1 ? `one ${noun}` : `${failed} ${noun}s`}, so this check used the photo description${failed === 1 ? "" : "s"} there.`);
  return parts.join(" ");
}

export interface SerialReading {
  serial: string;
  reading: PhotoReading;
}

/** The first serial read off the item itself. A packaging serial is never returned here. */
export function itemSerial(readings: PhotoReading[]): SerialReading | null {
  for (const reading of readings) if (reading.serial && reading.serialOn !== "packaging") return { serial: reading.serial, reading };
  return null;
}

/** The first serial read off a box, label or packaging. */
export function packagingSerial(readings: PhotoReading[]): SerialReading | null {
  for (const reading of readings) if (reading.serial && reading.serialOn === "packaging") return { serial: reading.serial, reading };
  return null;
}

/** The first photo that says the item is not there. */
export function itemMissing(readings: PhotoReading[]): PhotoReading | null {
  return readings.find((r) => r.itemPresent === false) ?? null;
}
