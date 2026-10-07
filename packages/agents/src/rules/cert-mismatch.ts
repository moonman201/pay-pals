/**
 * CERT_MISMATCH: the grading certificate on the card does not match the
 * grader's record, or the grader has no record for it. Stop. The record is
 * looked up before the rules run (review.ts) and passed in as certRecord;
 * the comparison itself is in cert/compare.ts.
 */
import { compareCertRecord } from "../cert/compare";
import type { Rule } from "./types";
import { flag } from "./text";

export const certMismatchRule: Rule = ({ card, certRecord }) => {
  if (!card || !card.certNumber || !certRecord) return [];
  const comparison = compareCertRecord(card, certRecord);
  if (comparison.matches) return [];
  return [flag("CERT_MISMATCH", "stop", comparison.evidence, comparison.explanation)];
};
