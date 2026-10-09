/**
 * Compares a grader's record with the item card. Deterministic. A card
 * matches its cert when the grade digits agree, the years agree when both
 * are known, and the record's subject shares enough words with the card's
 * title and model. The word overlap is the share of the card's own words
 * (year, set, character, card number; grade words removed) that also appear
 * in the record; SUBJECT_MATCH_THRESHOLD is 0.6.
 *
 * Honesty rules: a record that was never looked up (fixture provider, no
 * fixture entry) compares to null, "not checked", and is never a mismatch.
 * Only a real PSA answer with no record is a mismatch. A fixture record that
 * stands in for PSA is labelled a demo record in every sentence.
 */
import type { CertRecord, ItemCard } from "@pay-pals/contracts";
import { NOT_CHECKED_REASON, isNotChecked } from "./fixture-lookup";

export const SUBJECT_MATCH_THRESHOLD = 0.6;
export const NOT_CHECKED_EXPLANATION = `The cert number was not checked against PSA (${NOT_CHECKED_REASON}).`;

export interface CertComparison {
  /** True on a match, false on a mismatch or a real not-found, null when the cert was not checked. */
  matches: boolean | null;
  /** One plain sentence for the buyer. */
  explanation: string;
  /** The card and the record side by side, for the flag. */
  evidence: string;
  overlap: number;
}

const GRADE_WORDS = new Set(["psa", "bgs", "cgc", "sgc", "gem", "mint", "mt", "nm", "ex", "vg", "grade", "graded", "cert", "slab", "pop"]);
const STOP_WORDS = new Set(["the", "and", "of", "a", "an", "with"]);

/** "PSA 10" -> "10", "GEM MT 10" -> "10", "7" -> "7", "8.5" -> "8.5". Null when no grade number is present. */
export function gradeNumber(grade: string | null | undefined): string | null {
  if (!grade) return null;
  const matches = [...grade.matchAll(/\b(10|[1-9](?:\.5)?)\b/g)];
  const last = matches[matches.length - 1];
  return last ? last[1]! : null;
}

function yearIn(text: string | null | undefined): string | null {
  const match = text?.match(/\b(?:19|20)\d{2}\b/);
  return match ? match[0] : null;
}

export function subjectTokens(text: string, grade: string | null): Set<string> {
  const gradeDigits = gradeNumber(grade);
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9.]+/)) {
    const token = raw.replace(/^\.+|\.+$/g, "");
    if (token.length === 0 || STOP_WORDS.has(token) || GRADE_WORDS.has(token)) continue;
    if (gradeDigits !== null && token === gradeDigits) continue;
    out.add(token);
  }
  return out;
}

/** "PSA" for a live answer, "PSA (demo record)" for a fixture standing in for one. */
export function graderLabel(record: CertRecord): string {
  return record.provider === "psa" ? "PSA" : "PSA (demo record)";
}

export function compareCertRecord(card: ItemCard, record: CertRecord): CertComparison {
  const cert = card.certNumber ?? record.certNumber;
  const grader = graderLabel(record);
  const cardLabel = `"${card.title}"${card.grade ? `, grade ${card.grade}` : ""}`;

  if (isNotChecked(record)) {
    return { matches: null, explanation: NOT_CHECKED_EXPLANATION, evidence: `Cert ${cert} on the card for ${cardLabel}; not checked, ${NOT_CHECKED_REASON}`, overlap: 0 };
  }

  if (!record.subject) {
    return {
      matches: false,
      explanation: `${grader} has no record for cert ${cert}, so the slab label cannot be trusted.`,
      evidence: `Cert ${cert} on the card for ${cardLabel}; ${grader} has no record of it`,
      overlap: 0,
    };
  }

  const cardText = [card.title, card.model, card.brand].join(" ");
  const recordText = [record.subject, record.year, record.brand].filter(Boolean).join(" ");
  const cardTokens = subjectTokens(cardText, card.grade ?? null);
  const recordTokens = subjectTokens(recordText, record.grade);
  const shared = [...cardTokens].filter((t) => recordTokens.has(t)).length;
  const overlap = cardTokens.size === 0 ? 0 : shared / cardTokens.size;

  const cardGrade = gradeNumber(card.grade);
  const recordGrade = gradeNumber(record.grade);
  const gradeDiffers = cardGrade !== null && recordGrade !== null && cardGrade !== recordGrade;
  const cardYear = yearIn(cardText);
  const recordYear = record.year ?? yearIn(record.subject);
  const yearDiffers = cardYear !== null && recordYear !== null && cardYear !== recordYear;
  const subjectDiffers = overlap < SUBJECT_MATCH_THRESHOLD;

  const recordLabel = `"${record.subject}"${record.grade ? `, grade ${record.grade}` : ""}`;
  const evidence = `Cert ${cert} on the card for ${cardLabel}; ${grader} says ${recordLabel}`;

  if (!gradeDiffers && !yearDiffers && !subjectDiffers) {
    const subject = record.subject.slice(0, 90);
    return {
      matches: true,
      explanation:
        `${grader} has a record for cert ${cert} that matches this card (${subject}, grade ${record.grade ?? "not stated"}). That shows the slab exists, not that this seller is holding it.`.slice(0, 300),
      evidence,
      overlap,
    };
  }

  const reasons: string[] = [];
  if (subjectDiffers || yearDiffers) reasons.push(`a different card (${record.subject})`);
  if (gradeDiffers) reasons.push(`grade ${recordGrade}, not ${cardGrade}`);
  return {
    matches: false,
    explanation: `${grader} cert ${cert} is registered as ${reasons.join(" with ")}, so the slab label does not match the card.`.slice(0, 300),
    evidence,
    overlap,
  };
}
