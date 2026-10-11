import type { ArrivalCheck, ArrivalOutcome, ItemCard } from "@pay-pals/contracts";
import { ASK_FOR_A_CLEARER_PHOTO, CLAIMS_NEITHER, outcomeOf, OUTCOME_LABEL, unsettledOf } from "@/lib/deal/arrival-outcome";
import { PalAvatar } from "../pal/PalAvatar";
import { PalReasons } from "../pal/PalReasons";
import { Badge, type Tone } from "../ui/Badge";
import { Panel } from "../ui/Panel";
import { Comparison, type ComparisonRow, type ComparisonStatus } from "./Comparison";

const READ_FIELDS = ["brand", "model", "serial"] as const;
const NOT_READ = "not readable";

/**
 * Three outcomes, three looks, and the middle one is why this is not a
 * boolean any more (Decision 18). A red "does not match" over a serial the
 * pal could not settle is the exact claim the near-miss band exists to
 * prevent, so an unsettled check wears the caution colour and a word that is
 * neither a pass nor a fail.
 */
const OUTCOME_TONE: Readonly<Record<ArrivalOutcome, Tone>> = {
  match: "go",
  mismatch: "stop",
  inconclusive: "caution",
};

/** One row per field: the locked card on the left, what the arrival photos showed on the right. */
export function arrivalRows(check: ArrivalCheck, lockedCard: ItemCard | null): ComparisonRow[] {
  const unsettled = unsettledOf(check);
  const rows: ComparisonRow[] = READ_FIELDS.map((field) => {
    // A field the pal could not settle is neither a match nor a mismatch, and is looked for first:
    // the same field never appears in both lists, and an unsettled read must not fall through to match.
    const open = unsettled.find((m) => m.field === field);
    const mismatch = check.mismatches.find((m) => m.field === field);
    const found = open ?? mismatch;
    const observed = found?.observed ?? check.observed[field];
    const expected = found?.expected ?? lockedCard?.[field] ?? "";
    const status: ComparisonStatus = open ? "unsettled" : mismatch ? "mismatch" : observed && expected ? "match" : "unknown";
    return {
      label: field,
      left: expected || "not on the card",
      right: observed || NOT_READ,
      status,
      note: open ? open.explanation : null,
      mono: field === "serial",
    };
  });
  for (const m of [...check.mismatches, ...unsettled]) {
    if ((READ_FIELDS as readonly string[]).includes(m.field)) continue;
    rows.push({
      label: m.field,
      left: m.expected,
      right: m.observed,
      status: unsettled.includes(m) ? "unsettled" : "mismatch",
      note: unsettled.includes(m) ? m.explanation : null,
    });
  }
  return rows;
}

/** What the Buyer Pal found when it compared the arrival photos to the locked card. */
export function ArrivalResult({ check, lockedCard = null }: { check: ArrivalCheck; lockedCard?: ItemCard | null }) {
  const outcome = outcomeOf(check);
  const unsettled = unsettledOf(check);
  return (
    <Panel
      title="Arrival check"
      aside={
        <Badge tone={OUTCOME_TONE[outcome]} data-testid="arrival-outcome">
          {OUTCOME_LABEL[outcome]}
        </Badge>
      }
    >
      <div data-testid="arrival-result" data-outcome={outcome}>
        <div className="flex gap-3">
          <PalAvatar pal="buyer" size={36} />
          <p className="min-w-0 text-sm leading-relaxed">{check.palMessage}</p>
        </div>
        {outcome === "inconclusive" ? (
          <p className="mt-3 rounded-lg border border-caution-line bg-caution-soft px-3 py-2 text-sm leading-relaxed text-ink" data-testid="arrival-unsettled">
            {CLAIMS_NEITHER} {ASK_FOR_A_CLEARER_PHOTO}
            {unsettled.length > 0 ? (
              <span className="mt-1 block">
                What it could not settle: {unsettled.map((m) => `${m.field}, card says ${m.expected} and the arrival shows ${m.observed}`).join("; ")}.
              </span>
            ) : null}
          </p>
        ) : null}
        <Comparison
          leftTitle="Locked card"
          rightTitle="What arrived"
          rows={arrivalRows(check, lockedCard)}
          caption="The locked card against what the Buyer Pal read from the arrival photos"
        />
        <PalReasons reasoning={check.reasoning} pal="buyer" className="mt-4" />
      </div>
    </Panel>
  );
}
