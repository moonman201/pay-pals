/**
 * The claims this product has withdrawn, in one place, so the guards that
 * enforce them cannot disagree with each other.
 *
 * Why this exists. Matt's Oct 10 honesty pass (items D8 to D11) produced three
 * separate guards, each with its own table of patterns: one over apps/web's
 * rendered strings, one over packages/agents' output and prompts, and one over
 * every tracked Markdown file. On Oct 11 qa found they had already drifted:
 * "This proves the seller owns the item" was forbidden in a Markdown file and
 * allowed in a React component, because one table's pattern reached for
 * "ownership" or "it is genuine" while the other also accepted "the seller
 * owns". Three tables for one policy is three chances to be inconsistent, and
 * it had already taken one.
 *
 * So the policy lives here, as data, and every guard reads it. This is not a
 * contract type and nothing at runtime depends on it: it is the shared
 * vocabulary of what the product may not say, kept in the package every
 * workspace already depends on so no guard needs a cross-workspace import.
 *
 * Adding a claim here tightens every guard at once, which is the point. A
 * guard may add patterns of its own for things only it can see; it may not
 * keep a quieter version of one of these.
 */

export interface WithdrawnClaim {
  /** Matt's item number from the Oct 10 batch, so a failure can be traced to the decision. */
  id: "D8" | "D9" | "D10" | "D11";
  /** Why it was withdrawn, in one plain sentence, printed when a guard fails. */
  why: string;
  /** What to say instead. Printed with the failure so the fix is in the message. */
  instead: string;
  /**
   * The claim, not the wording, so a rephrasing does not escape it. A file may
   * name a forbidden phrase in order to forbid or withdraw it, which is what
   * each guard's own allow-list is for.
   */
  patterns: RegExp[];
}

export const WITHDRAWN_CLAIMS: readonly WithdrawnClaim[] = [
  {
    id: "D8",
    why: "refusing Pay Pals is a risk signal, never the strongest sign and never proof of fraud",
    instead: "call a refusal a risk signal, and say it ends the path through Pay Pals because Pay Pals only creates a Goods and Services payment",
    patterns: [/strongest (scam sign|sign|warning sign|stop)/i, /proof of (fraud|a scam)/i],
  },
  {
    id: "D9",
    why: "a serial or cert supports the listing; it never proves ownership or authenticity",
    instead: "say what was checked and against what, and that a matching number does not show who holds the item",
    patterns: [
      // Both halves of the drift qa found: the "ownership | authenticity | it is
      // genuine" form and the "the seller owns" form. Either is the same claim.
      /prove[sd]? (the )?(ownership|authenticity|it is genuine|they are genuine)/i,
      /prove[sd]? (that )?(the seller|he|she|they) (owns?|has|have|holds?)/i,
      /verified (authentic|owner|genuine)/i,
    ],
  },
  {
    id: "D10",
    why: "the evidence pack is useful context for a dispute, never a guaranteed outcome",
    instead: "say the pack is useful context for a PayPal dispute, which PayPal decides under its own terms",
    patterns: [/guarantees? (a )?(refund|outcome|win)/i, /get your money back/i, /will (win|be refunded)/i],
  },
  {
    id: "D11",
    why: "the audit chain is the official record PayPal can check first; a refund or dispute never requires it",
    instead: "say the chain is the official record of the deal that PayPal can check first",
    patterns: [/(refund|dispute) requires (the|this|our)/i, /required for a (refund|dispute)/i],
  },
];

/**
 * A denial immediately before a claim. "That doesn't prove the seller has it"
 * is the sentence D9 asks for, and it contains the phrase D9 forbids, so a
 * guard that only pattern-matches reports the honest sentence as a breach.
 *
 * qa hit this on the first run of the page guard against the slab room. The
 * Markdown guard never needed it because it exempts whole files; a rendered
 * page cannot, because the honest sentence and the claim it denies live in the
 * same document. It is the same mistake as an assertion that forbade the word
 * "dispute" and so failed the pal for saying "do not open a dispute".
 *
 * Contractions are included because "doesn't" is how the product actually
 * writes it. The window is deliberately short: a denial three sentences
 * earlier does not make a later claim honest.
 */
const NEGATOR = /\b(not|never|no|none|nothing|nobody|cannot|can't|doesn't|isn't|won't|wouldn't|didn't)\b[^.?!]{0,48}$/i;

/**
 * Every claim whose pattern matches the text and is not denied where it
 * matches, for a guard to report.
 *
 * A guard may still want the raw patterns, for instance to scan source where a
 * forbidden phrase appears inside a rule that forbids it. Those guards keep
 * their own allow-lists; this function is for prose.
 */
export function withdrawnClaimsIn(text: string): WithdrawnClaim[] {
  return WITHDRAWN_CLAIMS.filter((claim) =>
    claim.patterns.some((pattern) => {
      // Every match, not just the first: one honest denial does not excuse a
      // second, bare claim later in the same text.
      for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))) {
        const before = text.slice(0, match.index ?? 0);
        if (!NEGATOR.test(before)) return true;
      }
      return false;
    }),
  );
}
