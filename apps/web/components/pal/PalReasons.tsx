import type { PalReasoning } from "@pay-pals/contracts";
import { reasonGroups, type ReasonGroupId, type ReasonTone } from "@/lib/deal/pal-reasons";
import type { Role } from "@/lib/role";
import { PalAvatar } from "./PalAvatar";

const TONE: Record<ReasonTone, { box: string; title: string }> = {
  plain: { box: "border-line bg-wash", title: "text-ink" },
  caution: { box: "border-caution-line bg-caution-soft", title: "text-caution" },
  ask: { box: "border-[var(--accent-line)] bg-[var(--accent-soft)]", title: "text-[var(--accent-ink)]" },
};

/**
 * Why a pal decided what it decided: what it checked, what it found, what it
 * could not check, and what would change its mind.
 *
 * "What I could not check" is in the open, at full size, never behind a
 * disclosure and never last by accident. It is the group that makes the rest
 * worth reading.
 */
export function PalReasons({
  reasoning,
  pal,
  only,
  className = "",
}: {
  reasoning: PalReasoning | null | undefined;
  /** Whose face goes beside the groups. */
  pal: Role;
  /** Which groups to render here, in this order. Defaults to all four. */
  only?: readonly ReasonGroupId[];
  className?: string;
}) {
  const groups = reasonGroups(reasoning, only);
  if (groups.length === 0) return null;
  return (
    <div className={`grid gap-3 sm:grid-cols-2 ${className}`} data-testid="pal-reasons">
      {groups.map((group) => {
        const tone = TONE[group.tone];
        return (
          <section key={group.id} data-testid="pal-reason-group" data-group={group.id} className={`rounded-lg border p-3 ${tone.box} ${groups.length % 2 === 1 && group.id === groups[groups.length - 1]!.id ? "sm:col-span-2" : ""}`}>
            <div className="flex items-start gap-2">
              <PalAvatar pal={pal} size={22} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <h4 className={`text-sm font-bold ${tone.title}`}>{group.title}</h4>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{group.intro}</p>
              </div>
            </div>
            {group.items.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm leading-relaxed">{group.emptyText}</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
