import type { Message } from "@pay-pals/contracts";
import { formatTime } from "@/lib/format";
import { palName, type Role } from "@/lib/role";
import { PalAvatar } from "../pal/PalAvatar";
import { PhotoGrid } from "../photos/PhotoGrid";
import { Panel } from "../ui/Panel";

/** Your own pal's private channel. Blue for the buyer, gold for the seller. */
export function PalPane({ role, messages, flat = false }: { role: Role; messages: Message[]; flat?: boolean }) {
  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <PalAvatar pal={role} size={28} />
          {palName(role)}
        </span>
      }
      accent
      flat={flat}
      aside={<span className="text-xs text-[var(--accent-ink)]">private to you</span>}
    >
      {messages.length === 0 ? (
        <p className="text-sm text-muted">Your pal will speak up when there is something to check.</p>
      ) : (
        <ol className="space-y-3">
          {messages.map((m) => (
            <li key={m.id} className="flex gap-2">
              <PalAvatar pal={role} size={24} className="mt-1.5" />
              <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm border border-[var(--accent-line)] bg-[var(--accent-soft)] px-3 py-2">
                <p className="text-sm leading-relaxed text-ink">{m.text}</p>
                {m.photos.length > 0 ? (
                  <div className="mt-2">
                    <PhotoGrid photos={m.photos} size="sm" />
                  </div>
                ) : null}
                <p className="mt-1 text-[11px] text-muted">{formatTime(m.at)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
