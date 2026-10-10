/**
 * What changed between two Buyer Pal reviews. The same shape as card-diff:
 * the structured difference plus plain sentences. Used when new evidence
 * arrives and the pal looks again, so a reader can see which flags cleared,
 * which appeared and what the verdict went from and to.
 */
import { OVERALL_LABELS } from "../labels";
import { FLAG_WORDS } from "./override";
import { priceRangeLine } from "./price-copy";
import type { RedFlag, Verdict } from "@pay-pals/contracts";

export interface VerdictDiff {
  previous: Verdict;
  current: Verdict;
  /** Flag codes in the previous review and not in the new one. */
  cleared: RedFlag[];
  /** Flag codes in the new review and not in the previous one. */
  appeared: RedFlag[];
  /** Flag codes in both. Taken from the new review, which has the newer wording. */
  stayed: RedFlag[];
  overallChanged: boolean;
  /** One plain sentence per change, in reading order. Empty when the two reviews say the same thing. */
  lines: string[];
  /** The flags both reviews raised. Not a change, so it sits apart from `lines`. */
  unchangedLine: string | null;
}

/** The last two reviews, oldest first. Null when there is nothing to compare. */
export function lastTwoVerdicts(verdicts: readonly Verdict[]): { previous: Verdict; current: Verdict } | null {
  if (verdicts.length < 2) return null;
  return { previous: verdicts[verdicts.length - 2]!, current: verdicts[verdicts.length - 1]! };
}

function byCode(flags: readonly RedFlag[]): Map<string, RedFlag> {
  return new Map(flags.map((f) => [f.code, f]));
}

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function words(flags: readonly RedFlag[]): string {
  return list(flags.map((f) => FLAG_WORDS[f.code]));
}

function priceLine(previous: Verdict, current: Verdict): string | null {
  const before = priceRangeLine(previous.priceCheck);
  const after = priceRangeLine(current.priceCheck);
  return before === after ? null : `The price check went from "${before}" to "${after}".`;
}

function certLine(previous: Verdict, current: Verdict): string | null {
  const before = previous.certCheck?.matches;
  const after = current.certCheck?.matches;
  if (before === after) return null;
  const say = (value: boolean | null | undefined) => (value === true ? "matched the card" : value === false ? "did not match the card" : "was not checked");
  return `The cert check went from ${say(before)} to ${say(after)}.`;
}

export function diffVerdicts(previous: Verdict, current: Verdict): VerdictDiff {
  const before = byCode(previous.flags);
  const after = byCode(current.flags);
  const cleared = previous.flags.filter((f) => !after.has(f.code));
  const appeared = current.flags.filter((f) => !before.has(f.code));
  const stayed = current.flags.filter((f) => before.has(f.code));

  const lines: string[] = [];
  if (previous.overall !== current.overall) {
    lines.push(`The verdict went from ${OVERALL_LABELS[previous.overall]} to ${OVERALL_LABELS[current.overall]}.`);
  }
  if (previous.cardVersion !== current.cardVersion) {
    lines.push(`The new review was made against card version ${current.cardVersion}, the earlier one against version ${previous.cardVersion}.`);
  }
  if (cleared.length > 0) lines.push(`Cleared: ${words(cleared)}.`);
  if (appeared.length > 0) lines.push(`New: ${words(appeared)}.`);

  const answered = previous.questionsForSeller.filter((q) => !current.questionsForSeller.includes(q));
  if (answered.length > 0) lines.push(`${answered.length} ${answered.length === 1 ? "question" : "questions"} the pal asked before is no longer open.`);
  const asked = current.questionsForSeller.filter((q) => !previous.questionsForSeller.includes(q));
  if (asked.length > 0) lines.push(`${asked.length} new ${asked.length === 1 ? "question" : "questions"} for the seller.`);

  const price = priceLine(previous, current);
  if (price) lines.push(price);
  const cert = certLine(previous, current);
  if (cert) lines.push(cert);

  return {
    previous,
    current,
    cleared,
    appeared,
    stayed,
    overallChanged: previous.overall !== current.overall,
    lines,
    unchangedLine: stayed.length > 0 ? `Still there: ${words(stayed)}.` : null,
  };
}
