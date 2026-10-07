/**
 * Heuristic parse of a pasted listing into card fields. This is the fallback
 * when no model is available; with a model, Claude drafts the fields and this
 * file only supplies the price when the model leaves it out.
 */
import type { ConditionGrade } from "@pay-pals/contracts";

export interface ListingDraft {
  title: string;
  brand: string;
  model: string;
  conditionGrade: ConditionGrade;
  conditionNotes: string;
  included: string[];
  askingPrice: number | null;
}

const PRICE = /\$\s?(\d{1,6}(?:[.,]\d{1,2})?)/;

export function parsePrice(text: string): number | null {
  const match = text.match(PRICE);
  if (!match) return null;
  const value = Number(match[1]!.replace(",", "."));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

export function parseConditionGrade(text: string): ConditionGrade | null {
  const t = text.toLowerCase();
  if (/\b(?:for parts|not working|does not work|doesn't work|broken|dead)\b/.test(t)) return "for_parts";
  // "Like new" words win over "brand new" words: a seller who says both has worn it.
  if (/\b(?:like new|barely (?:worn|used)|mint|as new|excellent)\b/.test(t)) return "like_new";
  if (/\b(?:brand new|new in box|sealed|bnib|never (?:worn|used|opened))\b/.test(t)) return "new";
  if (/\b(?:cracked|heavy wear|heavily (?:worn|used)|deep scratch|dents?|rough)\b/.test(t)) return "fair";
  if (/\b(?:good|works (?:perfectly|great|fine)|light (?:wear|scuff|scratch)|small scuff|worn daily|used)\b/.test(t)) return "good";
  return null;
}

function tidy(item: string): string {
  const cleaned = item.replace(/^(?:the|a|an|original)\s+/i, "").replace(/[.;:]+$/, "").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function parseIncluded(text: string): string[] {
  const match = text.match(/\b(?:comes with|includes|including|included:?|with)\s+([^.!?\n]+)/i);
  if (!match) return [];
  return match[1]!
    .split(/,|\band\b|&|\+/)
    .map(tidy)
    .filter((s) => s.length >= 2 && s.length <= 80 && !/\$/.test(s))
    .slice(0, 10);
}

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const CONDITION_WORDS = /\b(?:scuff|scratch|wear|worn|condition|works|working|glass|screen|battery|crack|dent|mint|used|perfect|clean)\b/i;

export function parseListing(listingText: string, sellerNotes: string): ListingDraft {
  const sentences = sentencesOf(listingText);
  const first = (sentences[0] ?? listingText).replace(PRICE, "").trim();
  const head = first.split(/,| - | – | \| /)[0]!.trim();
  const words = head.split(/\s+/).filter((w) => w.length > 0);
  const brand = words[0] && /^[A-Z0-9]/.test(words[0]) ? words[0].replace(/[^A-Za-z0-9&'-]/g, "") : "";
  const model = words.slice(brand ? 1 : 0).join(" ").replace(/[.,;:]+$/, "").trim();
  const title = `${brand} ${model}`.trim();
  const all = `${listingText}\n${sellerNotes}`;

  const notes = sentences
    .slice(1)
    .filter((s) => CONDITION_WORDS.test(s) && !PRICE.test(s))
    .join(" ")
    .slice(0, 600);

  return {
    title: title.length > 0 ? title.slice(0, 120) : "Item",
    brand: brand.length > 0 ? brand.slice(0, 60) : "Unknown",
    model: model.length > 0 ? model.slice(0, 80) : title.slice(0, 80) || "Unknown",
    conditionGrade: parseConditionGrade(all) ?? "good",
    conditionNotes: notes,
    included: parseIncluded(all),
    askingPrice: parsePrice(all),
  };
}
