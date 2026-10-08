import type { ArrivalCheck, ItemCard } from "@pay-pals/contracts";
import { PalAvatar } from "../pal/PalAvatar";
import { Badge } from "../ui/Badge";
import { Panel } from "../ui/Panel";
import { Comparison, type ComparisonRow } from "./Comparison";

const READ_FIELDS = ["brand", "model", "serial"] as const;
const NOT_READ = "not readable";

/** One row per field: the locked card on the left, what the arrival photos showed on the right. The pal's reasons stay in its message, so nothing is said twice. */
export function arrivalRows(check: ArrivalCheck, lockedCard: ItemCard | null): ComparisonRow[] {
  const rows: ComparisonRow[] = READ_FIELDS.map((field) => {
    const mismatch = check.mismatches.find((m) => m.field === field);
    const observed = mismatch?.observed ?? check.observed[field];
    const expected = mismatch?.expected ?? lockedCard?.[field] ?? "";
    return {
      label: field,
      left: expected || "not on the card",
      right: observed || NOT_READ,
      status: mismatch ? "mismatch" : observed && expected ? "match" : "unknown",
      mono: field === "serial",
    };
  });
  for (const m of check.mismatches) {
    if ((READ_FIELDS as readonly string[]).includes(m.field)) continue;
    rows.push({ label: m.field, left: m.expected, right: m.observed, status: "mismatch" });
  }
  return rows;
}

/** What the Buyer Pal found when it compared the arrival photos to the locked card. */
export function ArrivalResult({ check, lockedCard = null }: { check: ArrivalCheck; lockedCard?: ItemCard | null }) {
  return (
    <Panel title="Arrival check" aside={<Badge tone={check.matches ? "go" : "stop"}>{check.matches ? "matches" : "does not match"}</Badge>}>
      <div className="flex gap-3">
        <PalAvatar pal="buyer" size={36} />
        <p className="min-w-0 text-sm leading-relaxed">{check.palMessage}</p>
      </div>
      <Comparison leftTitle="Locked card" rightTitle="What arrived" rows={arrivalRows(check, lockedCard)} caption="The locked card against what the Buyer Pal read from the arrival photos" />
    </Panel>
  );
}
