/**
 * `Mismatch.observed` is the "arrived" column of the comparison the page
 * renders. It may only hold what the pal saw. A photo caption is the buyer's
 * word, which is a different kind of evidence and is marked separately by
 * `observed.serialSource`, so a caption must never reach that column.
 *
 * This exists because it did. On one keyed run the empty-box branch wrote
 *
 *   nothing in the box but packaging: "Close-up of the label on the back of
 *   the console that arrived. The number under the barcode is AJ164952580."
 *
 * for a parcel that held a graded Pokemon card, so AJ164952580, a number
 * printed on nothing that arrived, was rendered as a thing the pal observed.
 * The prose on that run was honest; the structured field was not, and the
 * field is what the table reads.
 *
 * The caption no longer goes in that column at all, so this is a second line
 * of defence rather than the fix. It is the same move claim-check.ts makes for
 * prose: check the output against what was actually examined, rather than
 * trusting every writer of the field to remember.
 */
import type { Mismatch, Photo } from "@pay-pals/contracts";

/** Words long enough that sharing one is a sign of copying rather than coincidence. */
const MIN_SHARED_RUN = 5;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/**
 * True when `text` contains a run of MIN_SHARED_RUN or more consecutive words
 * from any caption. Short coincidental overlaps ("the back of the") are not
 * enough; a copied sentence is.
 */
export function quotesACaption(text: string, photos: readonly Photo[]): boolean {
  const haystack = ` ${words(text).join(" ")} `;
  for (const photo of photos) {
    const caption = words(photo.whatItShows);
    for (let i = 0; i + MIN_SHARED_RUN <= caption.length; i += 1) {
      if (haystack.includes(` ${caption.slice(i, i + MIN_SHARED_RUN).join(" ")} `)) return true;
    }
  }
  return false;
}

/**
 * Strips caption text out of the `observed` column, leaving the explanation
 * alone: prose may quote a caption, because prose can say whose words they
 * are, and the explanations here do. Only the column is policed.
 */
export function withoutCaptionsInObserved(mismatches: readonly Mismatch[], photos: readonly Photo[], replacement = "not something I saw"): Mismatch[] {
  return mismatches.map((m) => {
    if (!quotesACaption(m.observed, photos)) return m;
    if (process.env.PAY_PALS_DEBUG) console.debug(`[pay-pals agents] dropped caption text from a mismatch's observed column: ${m.observed}`);
    return { ...m, observed: replacement };
  });
}
