/**
 * Reads brand, model and serial out of a photo's whatItShows text, and tells
 * packaging photos from item photos. This is the fallback when the image
 * itself cannot be fetched (fixture photos are app-relative paths with no
 * files behind them yet).
 */

/**
 * A serial in a caption, written the way a person writes it: by the word
 * serial, by "the number under it is" or "the number under the barcode is",
 * by a label or barcode that reads one, or as a number sitting next to the
 * words serial, barcode or registration. Every shape ties the number to a
 * label, and none may cross a full stop, so the model code in a wide shot
 * ("MODEL CFI-1015A, manufactured ...") is never mistaken for a serial.
 */
const SERIAL_PATTERNS: readonly RegExp[] = [
  /\b(?:serial|s\/n|sn)\b(?:\s*(?:number|no\.?|num\.?|#))?\s*(?:is|:|reads|of|was|number)?\s*#?\s*([A-Z0-9-]{6,})/i,
  /\bthe number\s*(?:under|on|beside|next to|below)\b[^.]{0,30}?\bis\s*#?\s*([A-Z0-9-]{6,})/i,
  /\b(?:barcode|label)\b[^.]{0,30}?\b(?:and|read(?:s|ing)?|show(?:s|ing)?|is)\s+#?\s*([A-Z0-9-]{8,})\b/i,
  /\b(?:serial|barcode|registration)\b[^.]{0,40}?(?<!model )\b([A-Z0-9][A-Z0-9-]{7,})\b/i,
];

/** Uppercase, no spaces or dashes, so two readings of one serial compare equal. */
export function normalizeSerial(serial: string): string {
  return serial.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function serialFromText(text: string): string | null {
  for (const pattern of SERIAL_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const serial = normalizeSerial(match[1]!);
    if (serial.length >= 6 && /\d/.test(serial)) return serial;
  }
  return null;
}

/** "PlayStation 5 disc edition, CFI-1015A" -> { family: "PlayStation", number: "5" }. Null when the model has no word+number pair. */
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

const CERT = /\bcert(?:ificate|ification)?(?:\s*(?:number|no\.?|num\.?|#))?\s*(?:is|:)?\s*#?\s*(\d{6,12})\b/i;
/** A slab label states a grade and then a bare number; that number is the cert. */
const LABEL_NUMBER = /\bthe number\s*#?\s*(\d{6,12})\b/i;
const GRADE = /\b(PSA|BGS|CGC|SGC)\s*-?\s*(10|[1-9](?:\.5)?)\b/i;
/** PSA prints the grade in words: GEM MT 10, MINT 9. */
const GRADE_WORDS = /\b(GEM\s*-?\s*MT|GEM\s*MINT|MINT|NM\s*-?\s*MT|NM)\s*(10|[1-9](?:\.5)?)\b/i;

/** A grade as printed on a slab label, for example "PSA 10" or "GEM MT 10". */
export function gradeFromText(text: string): string | null {
  const graded = text.match(GRADE);
  if (graded) return `${graded[1]!.toUpperCase()} ${graded[2]}`;
  const words = text.match(GRADE_WORDS);
  return words ? `${words[1]!.toUpperCase().replace(/\s*-\s*/, " ").replace(/\s+/g, " ")} ${words[2]}` : null;
}

/** A grading certificate number named in text, for example "cert 72096346". A label that states a grade may just call it the number. */
export function certFromText(text: string): string | null {
  const match = text.match(CERT);
  if (match) return match[1]!;
  if (gradeFromText(text) === null) return null;
  const labelled = text.match(LABEL_NUMBER);
  return labelled ? labelled[1]! : null;
}

const PACKAGING =/\b(?:box label|label on the box|packaging|carton|sleeve|retail box|original box|shipping box|box that arrived)\b/i;

/** True when the description is of a box, label or packaging rather than the item itself. */
export function isPackagingDescription(text: string): boolean {
  return PACKAGING.test(text) || (/\bbox\b/i.test(text) && /\blabel\b/i.test(text));
}

/**
 * The ways a caption says the item is not there. "Nothing between them" is
 * how a person describes two foam inserts with no console between them, so it
 * counts; a box photographed with the item in it never matches.
 */
const ITEM_MISSING =
  /\b(?:no (?:console|item|unit|device|product)\b|empty\b|only (?:the )?(?:foam|insert|padding|packaging)|nothing (?:inside|in it|in the box|between|in between|else)\b|not (?:inside|in the box)|missing from the box)/i;

/** True when the description says the item itself is not there, for example an empty box. */
export function saysItemMissing(text: string): boolean {
  return ITEM_MISSING.test(text);
}
