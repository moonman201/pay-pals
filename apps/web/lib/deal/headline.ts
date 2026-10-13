/**
 * The name of a verdict wherever it is said in words. One function, so a go
 * verdict reads the same in the room headline, the pal pane and the evidence
 * pack. A go with open questions for the seller says how many.
 */
import type { Verdict } from "@pay-pals/contracts";
import { OVERALL_LABELS } from "../labels";

/**
 * The go headline exactly as the agents package spells it, with its full stop.
 *
 * Written out here rather than imported: the agents index pulls Node-only code (fs, image
 * decoders) and this file is in the client bundle. headline.test.ts pins it to goHeadline
 * from @pay-pals/agents, so the two cannot drift apart (Decision 15).
 */
export function goLine(verdict: Pick<Verdict, "questionsForSeller">): string {
  const n = verdict.questionsForSeller.length;
  return n === 0 ? "Looks good." : `Looks good, ${n} open question${n === 1 ? "" : "s"}.`;
}

/** The verdict as a bare name for a sentence that adds its own full stop: "Stop", "Looks good, 1 open question". */
export function verdictName(verdict: Pick<Verdict, "overall" | "questionsForSeller">): string {
  return verdict.overall === "go" ? goLine(verdict).replace(/\.$/, "") : OVERALL_LABELS[verdict.overall];
}
