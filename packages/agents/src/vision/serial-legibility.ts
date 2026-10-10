/**
 * The gate between what the vision model offers as a serial and what the pals
 * are allowed to treat as one.
 *
 * Why this exists. Telling the model "return null if any character is unclear"
 * is not enough, because the model does not feel unclear. On the clean deal's
 * wide shot of the console back the serial sticker is in frame but a few pixels
 * tall after the image is scaled down, and the model transcribes it anyway: six
 * runs of the old prompt gave AJ164952580 five times and AJ16495258Q once. The
 * single wrong character is the tell. A trailing Q where the real serial ends
 * in 0 is not a reading, it is a guess at a blurry glyph, and a guessed serial
 * is worse than no serial because it manufactures a mismatch against the box
 * label and spends the whole review on it.
 *
 * So the model is not asked to censor itself. It is asked a question it can
 * actually answer, separately and before it transcribes anything: how big and
 * how clear is this number in this frame. That is a property of the picture
 * rather than of the model's confidence, and the answer is applied here,
 * deterministically. A serial off a photo the model called small or soft is
 * discarded whatever characters came with it. The result is not "no serial",
 * it is "a serial that is there and could not be read", which is a fact the
 * pal reports rather than one it hides.
 *
 * Two things were measured against the real model on the real demo photos
 * before this shape was settled on, and both are worth keeping written down.
 *
 * First, the gate works. Eight runs on the wide console back: seven came back
 * small_or_soft, so no serial. The eighth returned no tool call at all and fell
 * through to the caption, which says the sticker is too small to read, so it
 * produced no serial either. Five runs on the serial close-up and five on the
 * arrival close-up: sharp every time, AJ164952580 every time. The box label is
 * sharp every time too. So the honest reads are kept and the guessed one is not.
 *
 * Second, asking the model which characters it cannot resolve changes the
 * legibility answer, even though the list itself is not used here. With that
 * question in the tool the wide shot came back small_or_soft seven times in
 * eight. With the question removed and everything else the same, it came back
 * sharp three times in six, and each of those three transcribed AJ16495258Q.
 * The question makes the model look at the glyphs before it judges the picture.
 * So uncertain_characters stays in read-photo.ts as the thing that earns the
 * legibility answer, and the legibility answer alone decides.
 *
 * The list is not a gate in its own right because it does not separate good
 * reads from bad ones. On the box label the model named an unresolved character
 * in roughly three runs in four, whether or not it had read the number right,
 * so gating on it threw away good reads without catching bad ones.
 *
 * What this gate does not cover, noted by reality-check on 2026-10-10. It only
 * sees answers that arrive. When the model returns no tool call at all,
 * readPhoto never reaches judgeSerial: it falls back to fromDescription, and
 * the serial then comes from the caption through serialFromText. On the wide
 * shot that path happened once in eight runs and was still safe, but the safety
 * came from the caption, which happens to say the sticker is too small to read.
 * A caption naming a number would have produced one on that run. So the
 * guarantee is "a serial the model transcribed off a photo it called small or
 * soft is discarded", not "an unreadable sticker can never yield a number". The
 * caption path is a different claim with its own provenance: see arrival.ts,
 * which says plainly when a number came from a description rather than a
 * picture, because a caption is the uploader's word rather than something read.
 *
 * The other thing it does not cover is a sharp photo read wrongly. This gate
 * asks how the number is drawn, not whether the transcription is right, so a
 * label it correctly calls sharp can still come back with the wrong
 * characters. Three distinct faults have been seen on clean-ps5/box-label.jpg,
 * whose true serial is AJ164952580, all on reads the gate called sharp and let
 * through:
 *
 *   AJ16495258O   trailing 0 read as O. Seen by this lane and by
 *                 reality-check independently, about 1 run in 5.
 *   AJ16495258Q   the same position read as Q, on the wide shot before the
 *                 gate existed.
 *   AJ16952580    the 4 at position 5 dropped. Seen on the keyed gate run of
 *                 2026-10-10, and it is the expensive one: card.boxSerial no
 *                 longer matched the card's serial, so the clean deal came
 *                 back caution with a model-added OTHER flag and the review
 *                 was spent asking the seller to confirm the box number.
 *
 * All three are one edit away from the truth, and the third is a deletion
 * rather than a substitution, so folding confusable glyph pairs at comparison
 * time would not catch it. A rule that treats a one-edit difference as neither
 * a match nor a mismatch handles all three. That changes what counts as a
 * match, so it is Matt's call and is not implemented here.
 */

/**
 * How the serial is drawn in this frame, judged before the characters are read.
 * `sharp`: each glyph is distinct on its own. `small_or_soft`: the number is
 * there but small, blurred or pixelated, so any transcription is part inference.
 * `none`: no serial in the picture.
 */
export const SERIAL_LEGIBILITIES = ["sharp", "small_or_soft", "none"] as const;
export type SerialLegibility = (typeof SERIAL_LEGIBILITIES)[number];

export interface SerialJudgement {
  /** The serial the pals may use, or null. */
  serial: string | null;
  /** True when a serial is in the picture but could not be read character for character. */
  illegible: boolean;
}

/** The clause the pal falls back to when the model gave no reason of its own. */
export const DEFAULT_UNREADABLE_REASON = "it is too small or too soft in this shot to read character for character";

/** Sentence openers that are only capitals because they started a sentence. */
const OPENERS = new Set(["the", "a", "an", "it", "its", "this", "that", "there", "no", "most", "part", "much", "some", "they"]);

/**
 * Turns whatever the model wrote into something that reads correctly after
 * "because": no closing stop, and no capital that was only there to open a
 * sentence. A first word that is a name or a model number keeps its case.
 */
export function asReasonClause(text: string): string {
  const trimmed = text.trim().replace(/[.\s]+$/, "");
  if (trimmed.length === 0) return trimmed;
  const firstWord = trimmed.split(/\s+/)[0] ?? "";
  if (!OPENERS.has(firstWord.toLowerCase())) return trimmed;
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

/**
 * Accepts a transcribed serial only when the model called the number sharp. A
 * missing legibility answer counts as sharp, so a degraded or older response
 * keeps the previous behaviour instead of silently dropping every serial.
 */
export function judgeSerial(transcribed: string | null, legibility: SerialLegibility | null): SerialJudgement {
  const soft = legibility === "small_or_soft";
  if (!transcribed) return { serial: null, illegible: soft };
  return soft ? { serial: null, illegible: true } : { serial: transcribed, illegible: false };
}
