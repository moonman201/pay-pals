import type { RedFlag } from "@pay-pals/contracts";
import { FLAG_WORDS } from "@/lib/deal/override";
import { PalAvatar } from "../pal/PalAvatar";
import { Badge, type Tone } from "../ui/Badge";
import { FlagEvidence } from "./FlagEvidence";

const FLAG_TONE: Record<RedFlag["severity"], Tone> = { info: "neutral", caution: "caution", stop: "stop" };

/** Flags the Buyer Pal raised at ship time, as the same chips the verdict uses. Shown to both sides. */
export function ShipmentFlags({ flags }: { flags: readonly RedFlag[] }) {
  return (
    <ul className="mt-3 space-y-2" aria-label="Buyer Pal shipment check" data-testid="shipment-flags">
      {flags.map((f, i) => (
        <li key={`${f.code}-${i}`} className="motion-reveal flex gap-3 rounded-lg border border-caution-line bg-caution-soft p-3 text-sm">
          <PalAvatar pal="buyer" size={28} className="mt-0.5" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">Buyer Pal:</span>
              <Badge tone={FLAG_TONE[f.severity]}>{f.severity}</Badge>
              <span className="rounded-md border border-line bg-surface px-2 py-0.5 font-semibold">{FLAG_WORDS[f.code]}</span>
            </div>
            <p className="mt-1">{f.explanation}</p>
            <FlagEvidence evidence={f.evidence} />
          </div>
        </li>
      ))}
    </ul>
  );
}
