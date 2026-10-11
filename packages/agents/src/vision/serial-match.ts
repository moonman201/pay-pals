/**
 * Comparing two serials when at least one of them was read off a photo.
 *
 * Why there are three outcomes and not two. A vision read of a serial is
 * lossy, and the losses are small: across one day of runs on
 * clean-ps5/box-label.jpg, whose true serial is AJ164952580, the model
 * produced AJ16495258O (0 read as O), AJ16495258Q (the same glyph read as Q)
 * and AJ16952580 (the 4 at position 5 dropped). Every one of those is a single
 * edit from the truth, and the third is a deletion, which is why folding
 * confusable glyph pairs was rejected: it would not have caught it.
 *
 * Treating a one-edit difference as a mismatch is what cost the clean deal a
 * caution with a flag on it, on the scenario whose point is that everything
 * checks out. Treating it as a match would be worse. So a one-edit difference
 * is neither: the pal says it cannot tell the two numbers apart, names them
 * both, and asks for a clearer photo (PLAN.md Decision 18, and Decision 20,
 * which is the general form of it).
 *
 * The accepted cost, on the record because Matt approved it knowing this: two
 * units off the same production line can have serials one digit apart, so a
 * genuinely different item can land in the band and not be called a mismatch.
 * The pal still refuses to call it a match, so nothing is confirmed and the
 * buyer is not told it is fine. It fails toward asking.
 *
 * Two conditions keep the band narrow:
 *   - at least one side must have come from an OCR read. Two numbers a person
 *     typed that differ by one character differ for some other reason, and
 *     softening that would weaken a real check;
 *   - the longer serial must be MIN_BANDED_LENGTH or more, because on a short
 *     identifier one edit is a large part of the string.
 */
import { normalizeSerial } from "./description";

/** Below this length a single edit is too large a share of the string to call it a near miss. */
export const MIN_BANDED_LENGTH = 8;

export type SerialComparison = "match" | "near" | "different";

/**
 * True when one substitution, insertion or deletion turns a into b. Linear and
 * early-exiting rather than a full edit-distance matrix, because the only
 * question is whether the distance is at most one.
 */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.length - short.length > 1) return false;

  if (short.length === long.length) {
    let differences = 0;
    for (let i = 0; i < short.length; i += 1) {
      if (short[i] !== long[i] && (differences += 1) > 1) return false;
    }
    return true;
  }

  // One longer: the short one must be the long one with a single character removed.
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i += 1;
      j += 1;
      continue;
    }
    if (skipped) return false;
    skipped = true;
    j += 1;
  }
  return true;
}

/**
 * How two serials compare. `near` is only ever returned when a photo read is
 * involved and the serials are long enough for one edit to be plausibly a
 * misread rather than a different number.
 */
export function compareSerials(a: string, b: string, options: { readFromPhoto: boolean }): SerialComparison {
  const left = normalizeSerial(a);
  const right = normalizeSerial(b);
  if (left === right) return "match";
  if (!options.readFromPhoto) return "different";
  if (Math.max(left.length, right.length) < MIN_BANDED_LENGTH) return "different";
  return withinOneEdit(left, right) ? "near" : "different";
}

/**
 * Where two near serials part company, as a clause for the buyer. Positions are
 * one-based, because this is read by a person counting characters on a label.
 */
export function describeDifference(a: string, b: string): string {
  const left = normalizeSerial(a);
  const right = normalizeSerial(b);
  if (left.length === right.length) {
    for (let i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) return `they differ only at character ${i + 1}, ${left[i]} against ${right[i]}`;
    }
    return "they are the same";
  }
  const [short, long] = left.length < right.length ? [left, right] : [right, left];
  for (let i = 0; i < long.length; i += 1) {
    if (short[i] !== long[i]) return `one of them is missing the character at position ${i + 1}, ${long[i]}`;
  }
  return `one of them is a character longer`;
}
