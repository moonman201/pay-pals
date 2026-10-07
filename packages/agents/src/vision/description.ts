/**
 * Reads brand, model and serial out of a photo's whatItShows text, and tells
 * packaging photos from item photos. This is the fallback when the image
 * itself cannot be fetched (fixture photos are app-relative paths with no
 * files behind them yet).
 */

const SERIAL = /\b(?:serial|s\/n|sn)\b(?:\s*(?:number|no\.?|num\.?|#))?\s*(?:is|:|reads|of|was|number)?\s*#?\s*([A-Z0-9-]{6,})/i;

/** Uppercase, no spaces or dashes, so two readings of one serial compare equal. */
export function normalizeSerial(serial: string): string {
  return serial.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function serialFromText(text: string): string | null {
  const match = text.match(SERIAL);
  if (!match) return null;
  const serial = normalizeSerial(match[1]!);
  return /\d/.test(serial) && serial.length >= 6 ? serial : null;
}

/** "PlayStation 5 disc edition, CFI-1215A" -> { family: "PlayStation", number: "5" }. Null when the model has no word+number pair. */
export function modelFamily(model: string): { family: string; number: string } | null {
  const match = model.match(/\b([A-Za-z]{3,})\s*-?\s*(\d+)\b/);
  return match ? { family: match[1]!, number: match[2]! } : null;
}

/** Finds a mention of the same product family in free text, for example "PlayStation 4" when the card says PlayStation 5. */
export function modelFromText(text: string, expectedModel: string): string | null {
  const family = modelFamily(expectedModel);
  if (!family) return null;
  const pattern = new RegExp(`\\b${family.family}\\s*-?\\s*\\d+[a-z]?(?:\\s+(?:pro|plus|max|mini|ultra|slim|disc|digital|edition))*`, "i");
  const match = text.match(pattern);
  return match ? match[0].replace(/\s+/g, " ").trim() : null;
}

export function brandFromText(text: string, expectedBrand: string): string | null {
  const brand = expectedBrand.trim();
  if (brand.length === 0) return null;
  return new RegExp(`\\b${brand}\\b`, "i").test(text) ? brand : null;
}

const PACKAGING = /\b(?:box label|label on the box|packaging|carton|sleeve|retail box|original box|shipping box|box that arrived)\b/i;

/** True when the description is of a box, label or packaging rather than the item itself. */
export function isPackagingDescription(text: string): boolean {
  return PACKAGING.test(text) || (/\bbox\b/i.test(text) && /\blabel\b/i.test(text));
}

const ITEM_MISSING = /\b(?:no (?:console|item|unit|device|product)\b|empty\b|only (?:the )?(?:foam|insert|padding|packaging)|nothing (?:inside|in it|in the box)|not (?:inside|in the box)|missing from the box)/i;

/** True when the description says the item itself is not there, for example an empty box. */
export function saysItemMissing(text: string): boolean {
  return ITEM_MISSING.test(text);
}
