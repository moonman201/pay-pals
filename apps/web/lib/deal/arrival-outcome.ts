/**
 * How apps/web talks about an arrival outcome, in one place.
 *
 * `inconclusive` is the case this exists for (PLAN.md Decision 18): a
 * comparison the pal could not settle, where the honest answer is neither
 * "the right item" nor "the wrong item". Every surface that used to read a
 * boolean now has three branches, and they say the same thing because they
 * all say it from here. Two ends describing one fact differently is what
 * Decision 15 is about, and this file is the other half of the compiler's
 * work: the compiler found the sites, this keeps their wording together.
 *
 * The phrasing follows the Buyer Pal's own, from review-reasons.ts and
 * photo-facts.ts, rather than inventing a second one for the same fact:
 * "not calling it a match and not calling it a mismatch", and asking for a
 * clearer photo of the label as the right response.
 */
import { ARRIVAL_OUTCOMES, type ArrivalCheck, type ArrivalOutcome, type Mismatch } from "@pay-pals/contracts";

/**
 * The outcome of a check, including one stored before v1.8.0.
 *
 * An arrival check round-trips as jsonb and v1.8.0 came with no migration,
 * so every row already written carries `matches: boolean` and no `outcome`.
 * Reading the old field is a faithful translation rather than a guess: when
 * that row was written there were only two answers, and `false` meant the
 * pal had positively found a difference. A row with neither field is
 * malformed, and the conservative reading of malformed is `inconclusive`,
 * which claims nothing.
 *
 * Every site in apps/web goes through here, so none of them has to know
 * about the old shape, and none of them crashes on a row that predates it.
 */
export function outcomeOf(check: Pick<ArrivalCheck, "outcome">): ArrivalOutcome {
  if (ARRIVAL_OUTCOMES.includes(check.outcome)) return check.outcome;
  const legacy = (check as { matches?: unknown }).matches;
  if (legacy === true) return "match";
  if (legacy === false) return "mismatch";
  return "inconclusive";
}

/** The comparisons a check could not settle. Non-empty exactly when the outcome is inconclusive. */
export function unsettledOf(check: Pick<ArrivalCheck, "unsettled">): Mismatch[] {
  return check.unsettled ?? [];
}

/** "serial, card says AJ164952580, arrived AJ16495258O" for each one, joined plainly. */
export function describeComparisons(items: readonly Mismatch[]): string {
  return items.map((m) => `${m.field}: card says ${m.expected}, arrived ${m.observed}`).join("; ");
}

/** The short word on the badge. Never a pass or a fail for an unsettled check. */
export const OUTCOME_LABEL: Readonly<Record<ArrivalOutcome, string>> = {
  match: "matches",
  mismatch: "does not match",
  inconclusive: "not settled",
};

/**
 * The sentence that says the pal is claiming neither thing. Said wherever an
 * inconclusive outcome is shown, because the whole point of the band is that
 * silence would read as a pass.
 */
export const CLAIMS_NEITHER = "The Buyer Pal is not calling that a match and not calling it a mismatch.";

/** What to do about it, which is the same ask the pal makes in its own prose. */
export const ASK_FOR_A_CLEARER_PHOTO = "A clearer photo of that label would settle it.";

/**
 * One plain sentence for what the check found, for a timeline summary or a
 * status line. `prefix` names what was compared and against which version.
 */
export function outcomeSentence(check: Pick<ArrivalCheck, "outcome" | "mismatches" | "unsettled">): string {
  switch (outcomeOf(check)) {
    case "match":
      return "Arrival matches the locked card.";
    case "mismatch":
      return `Arrival does not match. ${describeComparisons(check.mismatches)}.`;
    case "inconclusive": {
      const items = unsettledOf(check);
      const what = items.length > 0 ? ` ${describeComparisons(items)}.` : "";
      return `Arrival not settled.${what} ${CLAIMS_NEITHER}`;
    }
  }
}

/**
 * Whether this outcome is a positive finding of the wrong item. Only a
 * `mismatch` is: an unsettled comparison must never preselect an issue
 * reason or colour a row as a failure.
 */
export function isConfirmedMismatch(check: Pick<ArrivalCheck, "outcome"> | null | undefined): boolean {
  return check ? outcomeOf(check) === "mismatch" : false;
}
