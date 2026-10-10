/**
 * The shape of a pal's reasons, and the one rule about who may write them.
 *
 * Matt's item C5: every pal decision shows what it checked, what it found,
 * what it could not verify, and what would change its mind. The deterministic
 * side fills all four groups on its own, so a run with no model is still a run
 * that explains itself. The model may add to a group and may never take
 * anything out of one, which is the flag rule from merge-flags.ts applied to
 * sentences: what a rule put there is a fixed fact.
 *
 * A model line has to clear the same honesty check the pal message clears
 * (claim-check.ts), because a reason is a claim about what was examined and is
 * the easiest place to quietly claim more than was done. A line that says PSA
 * was contacted when it was not, or that describes a photo nobody looked at,
 * is dropped rather than rewritten.
 */
import type { PalReasoning } from "@pay-pals/contracts";
import { plainCopy } from "../copy";
import { unfoundedClaims, type ClaimContext } from "./claim-check";
import { quotesPromptScaffolding } from "./grounding";

/** The contract's per-sentence limit. */
export const REASON_MAX_LENGTH = 300;

/**
 * At most this many sentences in a group. The reasons are read, not skimmed,
 * and a wall of them hides the one line that matters. Our own lines are built
 * most important first, so a cut takes the least important.
 */
export const MAX_REASONS_PER_GROUP = 6;

export type ReasonLine = string | null | undefined | false;

export interface ModelReasoning {
  checked: string[];
  found: string[];
  could_not_verify: string[];
  would_change_my_mind: string[];
}

const key = (line: string): string =>
  line
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** House style, the contract's length, no blanks and no repeats. */
export function tidyReasons(lines: readonly ReasonLine[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    if (typeof line !== "string") continue;
    const text = plainCopy(line, REASON_MAX_LENGTH);
    if (text.length === 0) continue;
    const id = key(text);
    if (id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    out.push(text);
  }
  return out.slice(0, MAX_REASONS_PER_GROUP);
}

/**
 * The model's additions to one group: house style, nothing lifted out of the
 * prompt we sent, nothing the examination does not support, nothing already
 * said. Returns the rule lines followed by whatever survived.
 */
export function addModelReasons(ruleLines: readonly string[], modelLines: readonly string[] | undefined, claims: ClaimContext): string[] {
  const kept: string[] = [];
  for (const raw of modelLines ?? []) {
    if (typeof raw !== "string") continue;
    const text = plainCopy(raw, REASON_MAX_LENGTH);
    if (text.length === 0 || quotesPromptScaffolding(text)) continue;
    if (unfoundedClaims(text, claims).length > 0) continue;
    kept.push(text);
  }
  return tidyReasons([...ruleLines, ...kept]);
}

/**
 * Rule reasons plus the model's, group by group. Every rule line survives in
 * the order it was written; the model's follow it.
 */
export function mergeReasoning(rules: PalReasoning, model: ModelReasoning | null, claims: ClaimContext): PalReasoning {
  if (!model) return rules;
  return {
    checked: addModelReasons(rules.checked, model.checked, claims),
    found: addModelReasons(rules.found, model.found, claims),
    couldNotVerify: addModelReasons(rules.couldNotVerify, model.could_not_verify, claims),
    wouldChangeMyMind: addModelReasons(rules.wouldChangeMyMind, model.would_change_my_mind, claims),
  };
}
