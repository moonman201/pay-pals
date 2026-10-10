import type { Deal, DealEvent } from "@pay-pals/contracts";
import { formatTime } from "@/lib/format";
import { actorLabel, EVENT_KIND_LABELS, STATE_LABELS } from "@/lib/labels";
import { PalAvatar } from "../pal/PalAvatar";
import { Panel } from "../ui/Panel";

const DOT: Partial<Record<DealEvent["kind"], string>> = {
  agreed: "bg-[var(--accent)]",
  seller_joined: "bg-gold",
  invite_declined: "bg-stop",
  off_platform_chosen: "bg-caution",
  shipment_checked: "bg-caution",
  card_locked: "bg-navy",
  payment_captured: "bg-go",
  evidence_built: "bg-stop",
  arrival_checked: "bg-blue",
};

/** Every event on the deal, oldest first. Both sides see the same list. A pal's events carry its face. */
export function Timeline({ deal, events }: { deal: Deal; events: DealEvent[] }) {
  return (
    <Panel title="Timeline" aside={<span className="text-xs text-muted">{events.length} events</span>}>
      <ol className="relative space-y-3 border-l border-line pl-5">
        {events.map((e) => {
          const pal = e.actor === "buyer_pal" ? "buyer" : e.actor === "seller_pal" ? "seller" : null;
          return (
            <li key={e.id} className="relative text-sm">
              {pal ? (
                <PalAvatar pal={pal} size={22} className="absolute -left-[32px] top-0" />
              ) : (
                <span className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ${DOT[e.kind] ?? "bg-line"}`} aria-hidden />
              )}
              <p className="leading-snug">{e.summary}</p>
              <p className="text-[11px] text-muted">
                {EVENT_KIND_LABELS[e.kind]}, {actorLabel(e.actor, deal)}
                {e.kind === "state_changed" && e.fromState && e.toState ? `, ${STATE_LABELS[e.fromState]} to ${STATE_LABELS[e.toState]}` : ""}, {formatTime(e.at)}
                {e.hash ? (
                  <>
                    {", "}
                    <span className="font-mono" title={`Event hash ${e.hash}. Each event's hash covers the previous one, so the history cannot be edited quietly.`}>
                      #{e.hash.slice(0, 8)}
                    </span>
                  </>
                ) : null}
              </p>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
