/**
 * The one question the Buyer Pal always asks for a used electronic device
 * whose card shows no system or settings screen: a photo of that screen with
 * the serial on it. Deterministic, so the ask exists with or without a
 * model, and the evidence pack's "asked and never answered" line has
 * something real to point at when the seller ignores it.
 */
import type { ItemCard } from "@pay-pals/contracts";
import { deviceFamily } from "../seller/listing-parse";

const SCREEN_CAPTION = /\b(?:console information|system information|system info|settings(?: screen| page| menu)?|about (?:this )?(?:device|phone|mac|console)|about screen|serial on (?:the )?screen|on-screen serial)\b/i;

export const CONSOLE_PROOF_QUESTION = "Can you add a photo of the Console Information screen showing the serial?";
export const DEVICE_PROOF_QUESTION = "Can you add a photo of the system information screen showing the serial?";

/** True when a caption already describes a system or settings screen. */
export function hasScreenPhoto(card: ItemCard): boolean {
  return card.photos.some((p) => SCREEN_CAPTION.test(p.whatItShows));
}

/** The proof question for this card, or null when it is not a used device or already has the screen photo. */
export function proofQuestion(card: ItemCard | null): string | null {
  if (!card || card.conditionGrade === "new" || card.certNumber) return null;
  const family = deviceFamily(`${card.brand} ${card.model} ${card.title}`);
  if (!family || hasScreenPhoto(card)) return null;
  return family === "console" ? CONSOLE_PROOF_QUESTION : DEVICE_PROOF_QUESTION;
}

const SAME_ASK = /\b(?:console information|system information|information screen|settings screen)\b/i;

/** The proof question first, then the other questions with any repeat of the same ask removed. */
export function withProofQuestion(proof: string | null, others: string[]): string[] {
  if (!proof) return others;
  const normalized = (q: string) => q.toLowerCase().replace(/\s+/g, " ").trim();
  return [proof, ...others.filter((q) => normalized(q) !== normalized(proof) && !SAME_ASK.test(q))];
}
