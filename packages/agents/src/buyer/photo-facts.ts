/**
 * The photo facts block the review hands the model: for each card photo,
 * the seller's caption and, when the vision model read the image, what it
 * read. When no image was read the block says so, so the model cannot
 * mistake captions for things it saw.
 */
import type { PhotoReading } from "../vision/read-photo";

export function photoFactsBlock(readings: PhotoReading[], publicMode = false): string {
  if (readings.length === 0) return "The card has no photos.";
  const lines = readings.map((r, i) => {
    const caption = `${i + 1}. Seller's caption: "${r.photo.whatItShows}".`;
    if (r.imageStatus === "read") {
      const bits = [
        r.brand ? `brand ${r.brand}` : null,
        r.model ? `model ${r.model}` : null,
        r.serial
          ? `serial ${r.serial} on the ${r.serialOn === "packaging" ? "box or packaging" : "item"}`
          : r.serialIllegible
            ? `a serial is in the picture but it could not be read, because ${r.serialIllegibleReason}. There is no number from this photo. Do not guess one and do not treat it as a serial that differs from the card`
            : "no serial legible",
        r.itemPresent === false ? "the item itself is not in the picture" : r.itemPresent === true ? "the item is in the picture" : null,
      ].filter((b): b is string => b !== null);
      return `${caption} Read by the vision model: ${bits.join(", ")}.`;
    }
    const why = r.imageStatus === "not_loaded" ? "the file could not be loaded" : r.imageStatus === "model_failed" ? "the vision model gave no answer" : "no vision model was available";
    return `${caption} Not looked at${publicMode ? "" : ` (${why})`}; the caption is the seller's claim, not a fact about the picture.`;
  });
  const anyRead = readings.some((r) => r.imageStatus === "read");
  const footer = anyRead
    ? "Only facts marked read by the vision model are things that were seen."
    : "None of the photos was looked at. Do not describe what the photos show, do not call anything a stock photo or a real unit, and do not say a photo matches anything.";
  const publicNote = publicMode ? " Do not mention whether photo files loaded, opened or could be viewed; say only what you checked from the card and the chat." : "";
  return `Photos on the card and what was actually examined:\n${lines.join("\n")}\n${footer}${publicNote}`;
}
