/**
 * The rule engine. Runs every deterministic rule in a fixed order and returns
 * the flags, each with raisedByRule true. No model is involved here.
 */
import type { RedFlag, RedFlagSeverity, VerdictOverall } from "@pay-pals/contracts";
import type { Rule, RuleInput } from "./types";
import { friendsAndFamilyRule } from "./friends-and-family";
import { offPlatformRule } from "./off-platform";
import { priceBelowMarketRule } from "./price-below-market";
import { urgencyRule } from "./urgency";
import { missingSerialRule } from "./missing-serial";
import { shipBeforePayRule } from "./ship-before-pay";
import { nameMismatchRule } from "./name-mismatch";
import { stockPhotoRule } from "./stock-photo";

export type { Rule, RuleInput, SellerIdentity } from "./types";

export const RULES: readonly Rule[] = [
  friendsAndFamilyRule,
  offPlatformRule,
  priceBelowMarketRule,
  urgencyRule,
  shipBeforePayRule,
  nameMismatchRule,
  stockPhotoRule,
  missingSerialRule,
];

export function runRules(input: RuleInput): RedFlag[] {
  return RULES.flatMap((rule) => rule(input));
}

const SEVERITY_RANK: Record<RedFlagSeverity, number> = { info: 0, caution: 1, stop: 2 };

export function severityRank(severity: RedFlagSeverity): number {
  return SEVERITY_RANK[severity];
}

/** The overall verdict is never softer than the worst flag. */
export function overallFromFlags(flags: readonly RedFlag[]): VerdictOverall {
  if (flags.some((f) => f.severity === "stop")) return "stop";
  if (flags.some((f) => f.severity === "caution")) return "caution";
  return "go";
}
