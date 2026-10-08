import type { RedFlag } from "@pay-pals/contracts";
import { FLAG_WORDS } from "@/lib/deal/override";
import { Badge, type Tone } from "../ui/Badge";

const FLAG_TONE: Record<RedFlag["severity"], Tone> = { info: "neutral", caution: "caution", stop: "stop" };

/** Flags the Buyer Pal raised at ship time, as the same chips the verdict uses. Shown to both sides. */
export function ShipmentFlags({ flags }: { flags: readonly RedFlag[] }) {
  return (
    <ul className="mt-3 space-y-2" aria-label="Buyer Pal shipment check" data-testid="shipment-flags">
      {flags.map((f, i) => (
        <li key={`${f.code}-${i}`} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">Buyer Pal:</span>
            <Badge tone={FLAG_TONE[f.severity]}>{f.severity}</Badge>
            <span className="rounded-md border border-line bg-white px-2 py-0.5 font-semibold">{FLAG_WORDS[f.code]}</span>
          </div>
          <p className="mt-1">{f.explanation}</p>
          <p className="mt-1 text-xs text-muted">{f.evidence}</p>
        </li>
      ))}
    </ul>
  );
}
