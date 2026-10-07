import type { Message } from "@pay-pals/contracts";
import { formatTime } from "@/lib/format";
import { palName, type Role } from "@/lib/role";
import { PhotoGrid } from "../photos/PhotoGrid";
import { Panel } from "../ui/Panel";

/** Your own pal's private channel. Blue for the buyer, gold for the seller. */
export function PalPane({ role, messages }: { role: Role; messages: Message[] }) {
  return (
    <Panel title={palName(role)} accent aside={<span className="text-xs text-[var(--accent-ink)]">private to you</span>}>
      {messages.length === 0 ? (
        <p className="text-sm text-muted">Your pal will speak up when there is something to check.</p>
      ) : (
        <ol className="space-y-3">
          {messages.map((m) => (
            <li key={m.id} className="rounded-xl border border-[var(--accent-line)] bg-[var(--accent-soft)] px-3 py-2">
              <p className="text-sm leading-relaxed text-ink">{m.text}</p>
              {m.photos.length > 0 ? (
                <div className="mt-2">
                  <PhotoGrid photos={m.photos} size="sm" />
                </div>
              ) : null}
              <p className="mt-1 text-[11px] text-muted">{formatTime(m.at)}</p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
