/**
 * The review as a buyer reads it, in Matt's shape (Oct 11):
 *
 *   Stop. Don't pay.
 *   - Wants Friends and Family or Zelle. No protection.
 *   - His only photo matches a listing photo already on file.
 *   - Pushing you to pay within the hour.
 *   I'd look again if he sends the slab next to his name and today's
 *   date, and agrees to Goods and Services.
 *
 * A verdict in three words or fewer, then one line per reason at about
 * twelve words, then one line saying what would change it. Each fact once:
 * the reason lines are the flags' own explanations, so nothing is restated
 * here in different words, and anything a reason qualifies is qualified
 * beside it rather than in a second paragraph.
 *
 * `wouldChangeMyMind` used to be a group in the expander. It is one line at
 * the top instead, and where its items are related they are merged into a
 * single sentence, as Matt's example merges the photo and the payment method.
 * The group is still produced for the evidence pack, where a dispute reader
 * wants it itemised.
 *
 * Plain words only. No hash, chain, perceptual, Hamming, bits, provider,
 * fixture or payload reaches a line in here; where that precision matters it
 * lives in a flag's evidence, which is detail behind the expander.
 */
import type { PriceCheck, RedFlag, VerdictOverall } from "@pay-pals/contracts";
import { plainCopy } from "../copy";

/** At most this many reason lines. Beyond three a buyer stops reading, and the rest are in the expander. */
export const MAX_REASONS = 3;

/** The word the chat note leads with. Shorter than the review's own headline. */
const CHAT_WORD: Record<VerdictOverall, string> = { stop: "Stop", caution: "Careful", go: "Looks fair" };

/**
 * The line that goes in the buyer's private pal chat.
 *
 * apps/web posts `PalResult.palMessage` into that channel while the room
 * renders the verdict itself, so returning the whole review for both printed
 * it twice on one page. The chat says the review is done and points at it.
 */
export function chatNote(overall: VerdictOverall): string {
  return `Review done: ${CHAT_WORD[overall]}. Details above.`;
}

/** The verdict, three words or fewer. */
const HEADLINE: Record<VerdictOverall, string> = {
  stop: "Stop. Don't pay.",
  caution: "Careful.",
  go: "Looks fair.",
};

/**
 * Reasons, worst first, so a three-line cap keeps the ones that decide the
 * verdict. Within a severity the rules' own order stands.
 */
function worstFirst(flags: readonly RedFlag[]): RedFlag[] {
  const rank = { stop: 0, caution: 1, info: 2 } as const;
  return [...flags].sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/**
 * What the pal says when nothing is wrong. Still one line per fact, and still
 * only facts this deal actually has.
 */
function goodNews(askingPrice: number | null, priceCheck: PriceCheck | null, serial: string | null): string[] {
  const lines: string[] = [];
  if (askingPrice !== null && priceCheck && priceCheck.marketLow > 0) {
    lines.push(`Price sits inside the usual range, $${priceCheck.marketLow} to $${priceCheck.marketHigh}.`);
  }
  if (serial) lines.push(`Serial ${serial} is on the card, so it can be checked on arrival.`);
  lines.push("Nothing in the chat matches a pattern we check for.");
  return lines;
}

export interface VerdictMessageInput {
  overall: VerdictOverall;
  flags: readonly RedFlag[];
  /** Null when there is no card yet. */
  askingPrice: number | null;
  priceCheck: PriceCheck | null;
  serial: string | null;
  /** The items from wouldChangeMyMind, already merged where they are related. */
  wouldChangeMyMind: readonly string[];
  /** One short clause when the review ran on the chat alone. */
  scope?: string | null;
}

/**
 * Turns the itemised "what would change my mind" into the single line that
 * closes the review. Two items join with "and"; more than two would stop
 * being a line, so the rest stay in the pack.
 */
export function lookAgainLine(items: readonly string[]): string | null {
  const cleaned = items.map((i) => i.trim().replace(/\.$/, "")).filter((i) => i.length > 0);
  if (cleaned.length === 0) return null;
  const lower = (s: string) => (/^[A-Z](?![A-Z])/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  const picked = cleaned.slice(0, 2).map(lower);
  // review-reasons.ts writes the behaviour items without a subject ("agrees to Goods and
  // Services") so they read as the second half of the sentence. One leading the line needs its
  // subject back.
  const first = /^(?:he|she|they|the seller|anything|nothing)\b/.test(picked[0]!) ? picked[0]! : `he ${picked[0]!}`;
  return `I'd look again if ${[first, ...picked.slice(1)].join(", and ")}.`;
}

/**
 * The whole review, as one short block.
 *
 * Each line goes through plainCopy on its own rather than the block going
 * through once, because plainCopy strips a leading "- " as a markdown bullet
 * and would eat every reason marker. The bullets are added after.
 */
export function verdictMessage(input: VerdictMessageInput): string {
  const reasons =
    input.flags.length > 0
      ? worstFirst(input.flags)
          .map((f) => f.explanation.trim())
          .slice(0, MAX_REASONS)
      : goodNews(input.askingPrice, input.priceCheck, input.serial).slice(0, MAX_REASONS);

  const clean = (line: string) => plainCopy(line, 300).trim();
  const lines = [
    clean(HEADLINE[input.overall]),
    ...(input.scope ? [clean(input.scope)] : []),
    ...reasons.map((r) => `- ${clean(r.replace(/^-\s*/, ""))}`),
    ...(lookAgainLine(input.wouldChangeMyMind) ? [clean(lookAgainLine(input.wouldChangeMyMind)!)] : []),
  ].filter((l) => l.length > 0 && l !== "-");

  return lines.join("\n");
}
