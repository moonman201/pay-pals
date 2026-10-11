/**
 * The first thing a reader sees of a review: a verdict in three words, up
 * to three one-line reasons, and one line saying what would change it.
 *
 * It replaces a paragraph of the pal's prose. The prose is not gone: every
 * flag keeps its full explanation and its evidence in the cards below, and
 * the pal's own groups sit behind the expander. This is the summary that
 * used to be missing, not a replacement for the detail.
 *
 * A reason line is the pal's own explanation whenever that is already one
 * line. Since Oct 11 the pal writes to Matt's shape and most of them are,
 * so the room shows the pal's words rather than a second phrasing of the
 * same finding. The map below is the fallback for a flag whose explanation
 * is still a paragraph, and each entry is deliberately no stronger than
 * what the pal said.
 */
import type { RedFlag, RedFlagCode, Verdict, VerdictOverall } from "@pay-pals/contracts";

/** Matt's rule 2, with a word or two of slack: beyond this an explanation is not a line. */
const ONE_LINE_WORDS = 14;

export interface ReviewLead {
  /** Three words or fewer. The verdict and what to do about it. */
  headline: string;
  /** At most three, each one line. */
  reasons: string[];
  /** "I'd look again if ..." with the asks joined, or null when the pal named none. */
  lookAgain: string | null;
}

const HEADLINES: Readonly<Record<VerdictOverall, string>> = {
  stop: "Stop. Don't pay.",
  caution: "Careful. Ask first.",
  go: "Looks good.",
};

/**
 * The fallback line per flag, used only when the pal's own explanation is
 * longer than one line. Each is a restatement of the matching FLAG_WORDS
 * entry with its consequence, never a new fact.
 */
const FLAG_HEADLINES: Readonly<Record<RedFlagCode, string>> = {
  FRIENDS_AND_FAMILY_REQUEST: "Wants Friends and Family. That has no buyer protection.",
  OFF_PLATFORM_PAYMENT: "Wants paying outside PayPal. No protection, no dispute path.",
  PRICE_FAR_BELOW_MARKET: "Priced far below the going rate.",
  URGENCY_PRESSURE: "Pushing you to pay before the checks are done.",
  NAME_MISMATCH: "The PayPal account getting paid is not in the seller's name.",
  // "On file" is the honest half and the load-bearing one: the match is against
  // Pay Pals' own reference folder, never a search of the web.
  STOCK_OR_REUSED_PHOTO: "A photo matches a listing photo already on file.",
  MISSING_SERIAL: "No serial number, so there is nothing to match on arrival.",
  SHIP_BEFORE_PAY_TRICK: "Asking you to send money before anything ships.",
  INVITE_REFUSED: "The seller refused Pay Pals protection.",
  CERT_MISMATCH: "The grading cert does not match PSA's record.",
  MISSING_PACKING_PHOTO: "Shipped without the packing photo that was asked for.",
  OTHER: "Something else the pal wanted you to see.",
};

const SEVERITY_ORDER: Readonly<Record<RedFlag["severity"], number>> = { stop: 0, caution: 1, info: 2 };

/** The worst three flags, worst first. Ties keep the order the pal raised them in. */
function worstThree(flags: readonly RedFlag[]): RedFlag[] {
  return [...flags]
    .map((flag, i) => ({ flag, i }))
    .sort((a, b) => SEVERITY_ORDER[a.flag.severity] - SEVERITY_ORDER[b.flag.severity] || a.i - b.i)
    .slice(0, 3)
    .map((x) => x.flag);
}

/** One sentence from the pal's asks. They are already written as full sentences, so the first letter drops. */
function joinAsks(asks: readonly string[]): string | null {
  const cleaned = asks.map((a) => a.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  const parts = cleaned.map((a, i) => (i === 0 ? a : a.charAt(0).toLowerCase() + a.slice(1)));
  return parts.join(" ");
}

/** The pal's own sentence when it is already a line, otherwise this app's fallback for that code. */
export function reasonFor(flag: RedFlag): string {
  const own = flag.explanation.trim();
  return own !== "" && own.split(/\s+/).length <= ONE_LINE_WORDS ? own : FLAG_HEADLINES[flag.code];
}

export function reviewLead(verdict: Verdict): ReviewLead {
  const flags = worstThree(verdict.flags);
  // With no flags the pal's own findings are the reasons. They are what the old
  // "What I found" group held, so dropping that group loses nothing from the page.
  const reasons = flags.length > 0 ? flags.map(reasonFor) : [...(verdict.reasoning?.found ?? [])].slice(0, 3);
  return {
    headline: HEADLINES[verdict.overall],
    reasons,
    lookAgain: joinAsks(verdict.reasoning?.wouldChangeMyMind ?? []),
  };
}
