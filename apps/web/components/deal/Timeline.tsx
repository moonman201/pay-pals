import type { Deal, DealEvent } from "@pay-pals/contracts";
import { formatTime } from "@/lib/format";
import { actorLabel, EVENT_KIND_LABELS, STATE_LABELS } from "@/lib/labels";
import { timelineRows } from "@/lib/deal/timeline-rows";
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

/**
 * Every event on the deal, oldest first, both sides seeing the same list.
 * A pal's events carry its face.
 *
 * Collapsed by default (Matt's rule 4). It is the record, not the news: a
 * reader who wants to check the chain opens it, and the header's history
 * badge links straight here. State changes are folded into the action that
 * caused them, and every fingerprint stays on the page.
 */
export function Timeline({ deal, events }: { deal: Deal; events: DealEvent[] }) {
  const rows = timelineRows(events);
  return (
    <Panel
      title="Timeline"
      id="timeline"
      fold={{ count: events.length, unit: "events" }}
    >
      <div data-testid="timeline-details">
        <ol className="relative mt-3 space-y-3 border-l border-line pl-5">
          {rows.map(({ event, became, note, noteActor, hashes }) => {
            const pal = event.actor === "buyer_pal" ? "buyer" : event.actor === "seller_pal" ? "seller" : null;
            return (
              <li key={event.id} className="relative text-sm" data-testid="timeline-row">
                {pal ? (
                  <PalAvatar pal={pal} size={22} className="absolute -left-[32px] top-0" />
                ) : (
                  <span className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ${DOT[event.kind] ?? "bg-line"}`} aria-hidden />
                )}
                <p className="leading-snug">{event.summary}</p>
                {/* What the folded state change said, on the rare occasion it was not just the state's own name. */}
                {note && noteActor ? (
                  <p className="leading-snug text-[var(--accent-ink)]" data-testid="timeline-note">
                    {/* Named when it was not the row's own actor, so a buyer's words never read as the pal's. */}
                    {noteActor !== event.actor ? (
                      <span className="font-bold" data-testid="timeline-note-actor">
                        {actorLabel(noteActor, deal)} wrote:{" "}
                      </span>
                    ) : null}
                    {note}
                  </p>
                ) : null}
                <p className="text-[11px] text-muted">
                  {EVENT_KIND_LABELS[event.kind]}, {actorLabel(event.actor, deal)}
                  {became ? `, now ${STATE_LABELS[became]}` : ""}, {formatTime(event.at)}
                  {hashes.map((hash) => (
                    <span key={hash}>
                      {", "}
                      <span className="font-mono" title={`Event hash ${hash}. Each event's hash covers the previous one, so the history cannot be edited quietly.`}>
                        #{hash}
                      </span>
                    </span>
                  ))}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </Panel>
  );
}
