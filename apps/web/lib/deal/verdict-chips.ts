/**
 * The three short reasons on the verdict card, each a few words with the full sentence behind it.
 *
 * Nothing here is a new finding. A chip is either one of the pal's flags (worst first, its own
 * explanation and evidence behind it) or a plain restatement of a fact already on the page: the
 * cert record agreed, the serial matched the box, the price sat inside the range. A card with no
 * flags and none of those facts says "No red flags", which is what the review says.
 *
 * Every sentence that used to be a bullet in the review is still reachable: a flag chip carries the
 * pal's explanation and its evidence quote, and a fact chip carries the sentence it summarises.
 */
import { isGradedCard } from "./graded-price";
import { boxSerialLabel, boxSerialStatus } from "./box-serial";
import { certHeadline } from "./cert-copy";
import { hasUsableRange, priceRangeLine } from "./price-copy";
import { reasonFor } from "./review-lead";
import type { ItemCard, RedFlag, RedFlagCode, Verdict } from "@pay-pals/contracts";

export type ChipTone = "go" | "caution" | "stop";

export interface VerdictChip {
  id: string;
  /** A few words. Never more than three. */
  label: string;
  tone: ChipTone;
  /** The sentence behind the chip. For a flag, the pal's own explanation in full. */
  detail: string;
  /** The quote a stop or caution flag rests on, shown with the detail. */
  evidence: string | null;
  /** The cert chip offers the table. */
  opensCertTable: boolean;
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

const SEVERITY_TONE: Readonly<Record<RedFlag["severity"], ChipTone>> = { stop: "stop", caution: "caution", info: "caution" };
const SEVERITY_ORDER: Readonly<Record<RedFlag["severity"], number>> = { stop: 0, caution: 1, info: 2 };

export const MOST_CHIPS = 3;

export function flagChipLabel(code: RedFlagCode): string {
  return FLAG_CHIP_LABELS[code];
}

function flagChips(verdict: Verdict): VerdictChip[] {
  return [...verdict.flags]
    .map((flag, i) => ({ flag, i }))
    .sort((a, b) => SEVERITY_ORDER[a.flag.severity] - SEVERITY_ORDER[b.flag.severity] || a.i - b.i)
    .slice(0, MOST_CHIPS)
    .map(({ flag }, i) => ({
      id: `flag-${flag.code}-${i}`,
      label: flagChipLabel(flag.code),
      tone: SEVERITY_TONE[flag.severity],
      // The pal's own full explanation. reasonFor() would swap in a fallback line for a long one.
      detail: flag.explanation.trim() || reasonFor(flag),
      evidence: flag.evidence ?? null,
      opensCertTable: flag.code === "CERT_MISMATCH",
    }));
}

function factChips(verdict: Verdict, card: ItemCard | null, taken: ReadonlySet<string>): VerdictChip[] {
  const out: VerdictChip[] = [];
  if (verdict.flags.length === 0) {
    out.push({ id: "fact-no-flags", label: "No red flags", tone: "go", detail: verdict.reasoning?.found[0] ?? "The Buyer Pal found nothing to flag.", evidence: null, opensCertTable: false });
  }
  if (verdict.certCheck && verdict.certCheck.matches === true && !taken.has("Cert mismatch")) {
    out.push({ id: "fact-cert", label: "Cert on record", tone: "go", detail: certHeadline(verdict.certCheck), evidence: null, opensCertTable: true });
  }
  if (card && card.serial && card.boxSerial) {
    const status = boxSerialStatus(card);
    if (status === "match") out.push({ id: "fact-serial", label: "Serial matches box", tone: "go", detail: `The serial on the box label ${boxSerialLabel(card)}.`, evidence: null, opensCertTable: false });
    if (status === "mismatch" && !taken.has("Cert mismatch")) out.push({ id: "fact-serial", label: "Serial mismatch", tone: "stop", detail: `The serial on the box label ${boxSerialLabel(card)}.`, evidence: null, opensCertTable: false });
  }
  const check = verdict.priceCheck;
  if (card && !isGradedCard(card) && hasUsableRange(check) && !taken.has("Price too low")) {
    const asking = card.askingPrice;
    const inside = asking >= check.marketLow && asking <= check.marketHigh;
    if (inside) out.push({ id: "fact-price", label: "Price in range", tone: "go", detail: `The $${asking} ask sits inside the range. ${priceRangeLine(check)}.`, evidence: null, opensCertTable: false });
    else if (asking < check.marketLow) out.push({ id: "fact-price", label: "Price below range", tone: "caution", detail: `The $${asking} ask is under the range. ${priceRangeLine(check)}.`, evidence: null, opensCertTable: false });
    else out.push({ id: "fact-price", label: "Price above range", tone: "caution", detail: `The $${asking} ask is over the range. ${priceRangeLine(check)}.`, evidence: null, opensCertTable: false });
  }
  return out;
}

/** At most three chips: the worst flags first, then plain facts to fill the row. */
export function verdictChips(verdict: Verdict, card: ItemCard | null): VerdictChip[] {
  const flags = flagChips(verdict);
  const taken = new Set(flags.map((c) => c.label));
  const facts = factChips(verdict, card, taken);
  return [...flags, ...facts].slice(0, MOST_CHIPS);
}
