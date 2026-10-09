/**
 * Rows for the cert comparison: what the item card says against what the
 * grader's record says, one row per field the record carries.
 */
import type { CertCheck } from "@pay-pals/contracts";
import type { ComparisonRow } from "@/components/deal/Comparison";

const NO_RECORD = "no record for this cert number";

function same(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** A grade the card states inside its title, such as "PSA 10", counts as the card's grade when no grade field is set. */
function gradeOnCard(cardTitle: string | null, cardGrade: string | null): string | null {
  if (cardGrade?.trim()) return cardGrade.trim();
  const m = cardTitle?.match(/\b(PSA|BGS|CGC|SGC)\s*\d+(\.\d)?\b/i);
  return m ? m[0] : null;
}

export function certRows(check: CertCheck, cardTitle: string | null, cardGrade: string | null): ComparisonRow[] {
  const { record } = check;
  const missing = !record.subject && !record.grade;
  const grade = gradeOnCard(cardTitle, cardGrade);
  const status = (cardSide: string | null, recordSide: string | null): ComparisonRow["status"] => {
    if (check.matches === null) return "unknown";
    if (check.matches === true) return "match";
    if (missing) return "mismatch";
    if (!cardSide || !recordSide) return "unknown";
    return same(cardSide, recordSide) ? "match" : "mismatch";
  };
  const rows: ComparisonRow[] = [
    { label: "Item", left: cardTitle ?? "not on the card", right: missing ? NO_RECORD : (record.subject ?? "not in the record"), status: status(cardTitle, record.subject) },
    { label: "Grade", left: grade ?? "not on the card", right: missing ? NO_RECORD : (record.grade ?? "not in the record"), status: status(grade, record.grade) },
  ];
  if (record.year) rows.push({ label: "Year", left: cardTitle?.match(/\b(19|20)\d{2}\b/)?.[0] ?? "not on the card", right: record.year, status: status(cardTitle?.match(/\b(19|20)\d{2}\b/)?.[0] ?? null, record.year) });
  rows.push({ label: "Cert", left: record.certNumber, right: record.certNumber, status: missing ? "mismatch" : check.matches === null ? "unknown" : "match", mono: true });
  return rows;
}
