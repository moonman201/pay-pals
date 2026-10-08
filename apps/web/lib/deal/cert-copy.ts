/**
 * One sentence for the grader's answer, used by the item card and the
 * verdict panel so the card's grade and the record's grade each appear once.
 */
import type { CertCheck } from "@pay-pals/contracts";

export type CertTone = "go" | "stop" | "muted";

function graderName(check: CertCheck): string {
  return check.record.provider === "psa" ? "PSA" : "PSA (demo record)";
}

export function certSentence(check: CertCheck, cardGrade: string | null | undefined): { text: string; tone: CertTone } {
  const grader = graderName(check);
  const card = cardGrade?.trim() || "no grade on the card";
  if (check.matches === true) {
    return { text: `${grader} record agrees: ${check.record.grade ? `${card}` : card}`, tone: "go" };
  }
  if (check.matches === false) {
    if (!check.record.subject && !check.record.grade) return { text: `Card says ${card}. ${grader} has no record for this cert number.`, tone: "stop" };
    const record = [check.record.subject, check.record.grade ? `grade ${check.record.grade}` : null].filter(Boolean).join(", ");
    return { text: `Card says ${card}. ${grader} record says ${record}.`, tone: "stop" };
  }
  return { text: check.explanation, tone: "muted" };
}
