/**
 * The name of a verdict wherever it is said in words. One function, so a go
 * verdict reads the same in the room headline, the pal pane and the evidence
 * pack. A go with open questions for the seller says how many.
 */
import type { Verdict } from "@pay-pals/contracts";
import { OVERALL_LABELS } from "../labels";

export function verdictName(verdict: Pick<Verdict, "overall" | "questionsForSeller">): string {
  if (verdict.overall !== "go") return OVERALL_LABELS[verdict.overall];
  const open = verdict.questionsForSeller.length;
  if (open === 0) return OVERALL_LABELS.go;
  return `${OVERALL_LABELS.go}, ${open} open ${open === 1 ? "question" : "questions"}`;
}
