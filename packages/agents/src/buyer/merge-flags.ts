/**
 * Merges the model's review into the rule flags. The invariants, enforced
 * here and tested directly:
 *   - every rule flag survives with its code, evidence and raisedByRule intact;
 *   - a severity only ever goes up;
 *   - payment-method flags are always stop (PLAN.md Decision 1);
 *   - one flag per code.
 */
import type { RedFlag } from "@pay-pals/contracts";
import { PAYMENT_METHOD_FLAGS } from "@pay-pals/contracts";
import { plainCopy } from "../copy";
import { severityRank } from "../rules";
import type { ModelReview } from "./review-tool";

export function mergeModelReview(ruleFlags: readonly RedFlag[], review: ModelReview | null): RedFlag[] {
  const merged = new Map<RedFlag["code"], RedFlag>();
  for (const flag of ruleFlags) {
    const existing = merged.get(flag.code);
    if (!existing || severityRank(flag.severity) > severityRank(existing.severity)) merged.set(flag.code, { ...flag });
  }
  if (!review) return [...merged.values()];

  for (const { code, explanation } of review.explanations) {
    const flag = merged.get(code);
    const text = plainCopy(explanation, 300);
    if (flag && text.length > 0) flag.explanation = text;
  }

  for (const { code, severity } of review.severity_raises) {
    const flag = merged.get(code);
    if (flag && severityRank(severity) > severityRank(flag.severity)) flag.severity = severity;
  }

  for (const added of review.additional_flags) {
    const severity = PAYMENT_METHOD_FLAGS.includes(added.code) ? "stop" : added.severity;
    const existing = merged.get(added.code);
    if (existing) {
      if (severityRank(severity) > severityRank(existing.severity)) existing.severity = severity;
      continue;
    }
    const evidence = added.evidence.trim();
    const explanation = plainCopy(added.explanation, 300);
    if (evidence.length === 0 || explanation.length === 0) continue;
    merged.set(added.code, { code: added.code, severity, evidence: evidence.slice(0, 500), explanation, raisedByRule: false });
  }

  return [...merged.values()];
}
