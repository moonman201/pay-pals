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
import { plainCopy } from "../copy";
import { brandFromText, isPackagingDescription, modelFromText, normalizeSerial, saysItemMissing, serialFromText } from "./description";
import { fetchImage as defaultFetchImage, loadPhoto, type ImageFetcher } from "./fetch-image";
import { asReasonClause, DEFAULT_UNREADABLE_REASON, judgeSerial, SERIAL_LEGIBILITIES } from "./serial-legibility";

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
  /**
   * True when a serial is in the picture but too small or too soft to read
   * character for character, so nothing was taken from it. See
   * serial-legibility.ts: a guessed serial is worse than no serial.
   */
  serialIllegible: boolean;
  /** When serialIllegible, one plain clause saying what is in the way, for the pal's reasons. */
  serialIllegibleReason: string | null;
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
  serial_legibility: z.enum(SERIAL_LEGIBILITIES).nullable().default(null),
  uncertain_characters: z.array(z.string()).nullable().default(null),
  unreadable_reason: z.string().nullable().default(null),
  serial_on: z.enum(["item", "packaging"]).nullable(),
  item_present: z.boolean().nullable(),
});

const READING_TOOL: Anthropic.Tool = {
  name: "report_photo_reading",
  description:
    "Report exactly what is legibly printed or shown in the photo. Judge how big and how clear the serial is before you transcribe it, and name any character you cannot resolve. Use null for anything you cannot read.",
  input_schema: {
    type: "object",
    properties: {
      brand: { type: ["string", "null"], description: "Brand name as printed, or null." },
      model: { type: ["string", "null"], description: "Model name or number as printed or clearly identifiable, or null." },
      serial_legibility: {
        type: ["string", "null"],
        enum: [...SERIAL_LEGIBILITIES, null],
        description:
          "How big and how clear the serial is in this frame. Judge it before you transcribe anything, and judge the picture, not your confidence. sharp: the serial is one of the larger pieces of text in the frame, its characters are separated and solid, and you could still read it if everything around it were cropped away. small_or_soft: the serial is one of the smallest pieces of text in the frame, or its characters are blurred, pixelated or running together, so reading it means reconstructing some of it from context. none: there is no serial in the picture. A whole-device shot where the serial sticker is a thin strip a few pixels tall is small_or_soft. A close-up where the label fills a good part of the frame is sharp, including when the label is rotated or sideways.",
      },
      serial: {
        type: ["string", "null"],
        description: "The full serial number exactly as printed, or null when there is none. Transcribe what you see; do not hold a reading back because it was hard, say that in serial_legibility instead.",
      },
      uncertain_characters: {
        type: ["array", "null"],
        items: { type: "string" },
        description:
          "Every character of the serial whose glyph you cannot resolve in this picture, each as its position and the glyphs it could be, such as \"position 11: 0 or Q\". Empty when you can see every glyph plainly. Answer this honestly and in full; it is how you check your own reading before you stand behind it.",
      },
      unreadable_reason: {
        type: ["string", "null"],
        description:
          "When serial_legibility is small_or_soft, one short plain clause saying what is in the way, such as \"the sticker is a thin strip in a wide shot of the whole console\". Null otherwise. The pal shows this to the buyer as the reason it could not read the number, so write it for a person, not for a log.",
      },
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
    required: ["brand", "model", "serial_legibility", "serial", "uncertain_characters", "unreadable_reason", "serial_on", "item_present"],
    additionalProperties: false,
  },
};

const SYSTEM = [
  "You read product photos for a deal between two strangers.",
  "Report only what you can actually see. A serial number must be copied character for character.",
  "Judge how the serial is drawn before you transcribe it, and judge the picture rather than how sure you feel. A serial sticker that is a thin strip in a photo of a whole device is small_or_soft even when you think you can make the characters out. A label that fills a good part of the frame is sharp, including when it is rotated.",
  "Before you stand behind a transcription, name every character whose glyph you cannot resolve in this picture. Checking your own reading that way is the point of the question.",
  "When the serial is small_or_soft, say in one short plain clause what is in the way. The buyer reads that sentence, so write it for a person.",
  "A wrong character is worse than no serial at all, because it makes two people believe they are holding different items.",
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
    // A caption is a claim, not a picture. There is no glyph here to call illegible.
    serialIllegible: false,
    serialIllegibleReason: null,
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
  const transcribed = result.value.serial ? normalizeSerial(result.value.serial) || null : null;
  const { serial, illegible } = judgeSerial(transcribed, result.value.serial_legibility);
  return {
    photo,
    brand: result.value.brand?.trim() || null,
    model: result.value.model?.trim() || null,
    serial,
    serialOn: serial ? (result.value.serial_on ?? (isPackagingDescription(photo.whatItShows) ? "packaging" : "item")) : null,
    serialIllegible: illegible,
    serialIllegibleReason: illegible ? asReasonClause(plainCopy(result.value.unreadable_reason ?? "", 200)) || DEFAULT_UNREADABLE_REASON : null,
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

/**
 * One plain sentence on what was looked at. Empty when there were no photos.
 * In public mode (a presentation flag, see presentation.ts) only the part
 * about photos that were read is kept; nothing is said about files that
 * could not be loaded, and nothing at all when nothing was read.
 */
export function describeLooking(readings: PhotoReading[], noun: string, publicMode = false): string | null {
  const n = readings.length;
  if (n === 0) return null;
  const plural = (count: number) => (count === 1 ? noun : `${noun}s`);
  const read = readings.filter((r) => r.imageStatus === "read").length;
  const notLoaded = readings.filter((r) => r.imageStatus === "not_loaded").length;
  const failed = readings.filter((r) => r.imageStatus === "model_failed").length;
  if (publicMode) {
    if (read === 0) return null;
    return read === n ? `I looked at the ${n === 1 ? noun : `${n} ${noun}s`}.` : `I looked at ${read} of the ${n} ${noun}s.`;
  }
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
