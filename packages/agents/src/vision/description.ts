/**
 * Reads brand, model and serial out of a photo's whatItShows text. This is
 * the fallback when the image itself cannot be fetched (fixture photos are
 * app-relative paths with no files behind them yet).
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

/** "Fenix 7 Pro Solar 47mm" -> { family: "Fenix", number: "7" }. Null when the model has no word+number pair. */
export function modelFamily(model: string): { family: string; number: string } | null {
  const match = model.match(/\b([A-Za-z]{3,})\s*-?\s*(\d+)\b/);
  return match ? { family: match[1]!, number: match[2]! } : null;
}

/** Finds a mention of the same product family in free text, for example "Fenix 6" when the card says Fenix 7. */
export function modelFromText(text: string, expectedModel: string): string | null {
  const family = modelFamily(expectedModel);
  if (!family) return null;
  const pattern = new RegExp(`\\b${family.family}\\s*-?\\s*\\d+[a-z]?(?:\\s+(?:pro|plus|solar|sapphire|max|mini|ultra|x|s))*`, "i");
  const match = text.match(pattern);
  return match ? match[0].replace(/\s+/g, " ").trim() : null;
}

export function brandFromText(text: string, expectedBrand: string): string | null {
  const brand = expectedBrand.trim();
  if (brand.length === 0) return null;
  return new RegExp(`\\b${brand}\\b`, "i").test(text) ? brand : null;
}
