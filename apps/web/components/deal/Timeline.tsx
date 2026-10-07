import type { Deal, DealEvent } from "@pay-pals/contracts";
import { formatTime } from "@/lib/format";
import { actorLabel, STATE_LABELS } from "@/lib/labels";
import { Panel } from "../ui/Panel";

const DOT: Partial<Record<DealEvent["kind"], string>> = {
  card_locked: "bg-navy",
  payment_captured: "bg-go",
  evidence_built: "bg-stop",
  arrival_checked: "bg-sky",
};

/** Every event on the deal, oldest first. Both sides see the same list. */
export function Timeline({ deal, events }: { deal: Deal; events: DealEvent[] }) {
  return (
    <Panel title="Timeline" aside={<span className="text-xs text-muted">{events.length} events</span>}>
      <ol className="relative space-y-3 border-l border-line pl-4">
        {events.map((e) => (
          <li key={e.id} className="relative text-sm">
            <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${DOT[e.kind] ?? "bg-line"}`} aria-hidden />
            <p className="leading-snug">{e.summary}</p>
            <p className="text-[11px] text-muted">
              {actorLabel(e.actor, deal)}
              {e.kind === "state_changed" && e.fromState && e.toState ? `, ${STATE_LABELS[e.fromState]} to ${STATE_LABELS[e.toState]}` : ""}, {formatTime(e.at)}
            </p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
