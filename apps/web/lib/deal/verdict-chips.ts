/**
 * The short reasons on the verdict card, each a few words with the pal's own evidence behind it.
 *
 * A chip exists only because the pal produced something for it. There are exactly three sources:
 *
 *   flag    one of the verdict's red flags, worst first with a stop always ahead of a caution.
 *           Within a severity they follow a fixed evidence order (EVIDENCE_ORDER below), not the order
 *           the pal listed them in, so the same deal always shows the same three chips. Its explanation and evidence ride along.
 *   cert    the grader comparison, when one ran (certCheck.matches is true or false, not null).
 *   price   where the ask sits against the price check's own range, when a usable check exists and
 *           the card is not graded. It is priceStance(), which mirrors the agents' price position.
 *
 * Nothing is a filler. A deal with no flags, no cert comparison and no usable price result has no
 * chips, and the card says so with nothing at all rather than "No red flags" or "Serial matches".
 * lib/deal/verdict-chips.test.ts holds every chip of every scenario to one of the three sources.
 */
import { PAYMENT_METHOD_FLAGS, type CertCheck, type ItemCard, type RedFlag, type RedFlagCode, type Verdict } from "@pay-pals/contracts";
import { priceStance, type PriceStance } from "./price-stance";
import { reasonFor } from "./review-lead";

export type ChipTone = "go" | "caution" | "stop";
export type ChipKind = "flag" | "cert" | "price";

export interface VerdictChip {
  id: string;
  kind: ChipKind;
  /** A few words. */
  label: string;
  tone: ChipTone;
  /** The sentence behind the chip. For a flag, the pal's own explanation in full. */
  detail: string;
  /** The quote a flag rests on, shown with the detail. */
  evidence: string | null;
  /** Set on the flag chip only: which rule raised it, so a test can match the chip to the verdict. */
  flagCode: RedFlagCode | null;
  /** Set on a cert chip: the comparison that ran. */
  cert: CertCheck | null;
  /** Set on a price chip: the stance, from the real price check. */
  price: PriceStance | null;
}

const FLAG_CHIP_LABELS: Readonly<Record<RedFlagCode, string>> = {
  FRIENDS_AND_FAMILY_REQUEST: "Friends and Family",
  OFF_PLATFORM_PAYMENT: "Pays outside PayPal",
  PRICE_FAR_BELOW_MARKET: "Price too low",
  URGENCY_PRESSURE: "Urgency pressure",
  NAME_MISMATCH: "Name mismatch",
  STOCK_OR_REUSED_PHOTO: "Reused photo",
  MISSING_SERIAL: "No serial read",
  SHIP_BEFORE_PAY_TRICK: "Pay before ship",
  INVITE_REFUSED: "Refused Pay Pals",
  CERT_MISMATCH: "Cert mismatch",
  MISSING_PACKING_PHOTO: "No packing photo",
  OTHER: "Other concern",
};

/**
 * How strong the evidence behind a flag is, strongest first, for ranking within one severity (Matt, Oct 14):
 * payment-method flags, cert mismatch, reused photo, price far below market, urgency or pay-before-ship,
 * a missing serial or packing photo, name mismatch, then anything else.
 */
function evidenceRank(code: RedFlagCode): number {
  if (PAYMENT_METHOD_FLAGS.includes(code)) return 0;
  switch (code) {
    case "CERT_MISMATCH":
      return 1;
    case "STOCK_OR_REUSED_PHOTO":
      return 2;
    case "PRICE_FAR_BELOW_MARKET":
      return 3;
    case "URGENCY_PRESSURE":
    case "SHIP_BEFORE_PAY_TRICK":
      return 4;
    case "MISSING_SERIAL":
    case "MISSING_PACKING_PHOTO":
      return 5;
    case "NAME_MISMATCH":
      return 6;
    default:
      return 7;
  }
}

const SEVERITY_TONE: Readonly<Record<RedFlag["severity"], ChipTone>> = { stop: "stop", caution: "caution", info: "caution" };
const SEVERITY_ORDER: Readonly<Record<RedFlag["severity"], number>> = { stop: 0, caution: 1, info: 2 };

export const MOST_CHIPS = 3;

export function flagChipLabel(code: RedFlagCode): string {
  return FLAG_CHIP_LABELS[code];
}

const blank = { evidence: null, flagCode: null, cert: null, price: null } as const;

function flagChips(verdict: Verdict): VerdictChip[] {
  return [...verdict.flags]
    .map((flag, i) => ({ flag, i }))
    .sort((a, b) => SEVERITY_ORDER[a.flag.severity] - SEVERITY_ORDER[b.flag.severity] || evidenceRank(a.flag.code) - evidenceRank(b.flag.code) || a.i - b.i)
    .slice(0, MOST_CHIPS)
    .map(({ flag }, i) => ({
      ...blank,
      id: `flag-${flag.code}-${i}`,
      kind: "flag" as const,
      label: flagChipLabel(flag.code),
      tone: SEVERITY_TONE[flag.severity],
      // The pal's own full explanation. reasonFor() would swap in a fallback line for a long one.
      detail: flag.explanation.trim() || reasonFor(flag),
      evidence: flag.evidence ?? null,
      flagCode: flag.code,
    }));
}

/** At most three chips, each from a flag, a cert comparison that ran, or the price check's own range. */
export function verdictChips(verdict: Verdict, card: ItemCard | null): VerdictChip[] {
  const chips = flagChips(verdict);
  const hasFlag = (code: RedFlagCode) => verdict.flags.some((f) => f.code === code);

  const cert = verdict.certCheck;
  if (cert && cert.matches === true) {
    chips.push({ ...blank, id: "cert", kind: "cert", label: "Cert on record", tone: "go", detail: "", cert });
  } else if (cert && cert.matches === false && !hasFlag("CERT_MISMATCH")) {
    chips.push({ ...blank, id: "cert", kind: "cert", label: "Cert mismatch", tone: "stop", detail: "", cert });
  }

  // A price flag already says it, and a graded card gets no price stance at all.
  const stance = hasFlag("PRICE_FAR_BELOW_MARKET") ? null : priceStance(verdict.priceCheck, card);
  if (stance) chips.push({ ...blank, id: "price", kind: "price", label: stance.label, tone: stance.tone, detail: stance.sentence, price: stance });

  return chips.slice(0, MOST_CHIPS);
}
