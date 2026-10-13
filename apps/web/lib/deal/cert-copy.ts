/**
 * One sentence for the grader's answer, used by the item card and the
 * verdict panel so the card's grade and the record's grade each appear once.
 */
import type { CertCheck } from "@pay-pals/contracts";

export type CertTone = "go" | "stop" | "muted";

/** "PSA" for the real grader, "Demo PSA" for the fixture record, so the demo is plain wherever the result shows. */
export function graderName(check: CertCheck): string {
  return check.record.provider === "psa" ? "PSA" : "Demo PSA";
}

/** Who the cert was compared with, mid-sentence: "PSA's record" or "the demo PSA record". */
function recordOwner(check: CertCheck): string {
  return check.record.provider === "psa" ? "PSA's record" : "the demo PSA record";
}

export function certSentence(check: CertCheck, cardGrade: string | null | undefined): { text: string; tone: CertTone } {
  const grader = graderName(check);
  const card = cardGrade?.trim() || "no grade on the card";
  if (check.matches === true) {
    return { text: `${grader} record agrees: ${card}`, tone: "go" };
  }
  if (check.matches === false) {
    if (!check.record.subject && !check.record.grade) return { text: `Card says ${card}. ${grader} has no record for this cert number.`, tone: "stop" };
    const record = [check.record.subject, check.record.grade ? `grade ${check.record.grade}` : null].filter(Boolean).join(", ");
    return { text: `Card says ${card}. ${grader} record says ${record}.`, tone: "stop" };
  }
  return { text: check.explanation, tone: "muted" };
}

/**
 * The one line above the comparison table: what the check found, and what
 * it does not prove.
 *
 * The second half is the point. A cert that matches says the slab is real
 * and graded; it says nothing about who is holding it, and a reader who
 * takes a green "matches" as proof of the seller has read it wrong. Matt's
 * words: "The slab exists. That doesn't prove he has it."
 *
 * The panel used to print this finding, then the table, then a closing
 * paragraph saying the same thing again. This is the one place it is said.
 */
export function certHeadline(check: CertCheck): string {
  const owner = recordOwner(check);
  const cert = `Cert ${check.record.certNumber}`;
  if (check.matches === true) return `${cert} matches ${owner}. The slab exists. That doesn't prove the seller has it.`;
  if (check.matches === false) return `${cert} does not match ${owner}. ${check.explanation}`;
  return `${cert} could not be checked. ${check.explanation}`;
}
