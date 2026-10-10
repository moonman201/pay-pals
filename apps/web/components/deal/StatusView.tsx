import { countStatuses, STATUS_LEGEND, STATUS_WORDS, type StatusGroup, type StatusLabel } from "@/lib/deal/status-view";
import { Panel } from "../ui/Panel";
import { CautionIcon, CheckIcon, StopIcon } from "../ui/icons";

const STYLE: Record<StatusLabel, { chip: string; rail: string; icon: typeof CheckIcon }> = {
  verified: { chip: "border-go-line bg-go-soft text-go", rail: "border-l-go-line", icon: CheckIcon },
  unverified: { chip: "border-caution-line bg-caution-soft text-caution", rail: "border-l-caution-line", icon: CautionIcon },
  missing: { chip: "border-line bg-wash text-muted", rail: "border-l-line", icon: StopIcon },
};

function Chip({ status }: { status: StatusLabel }) {
  const style = STYLE[status];
  const Icon = style.icon;
  return (
    <span
      data-testid="status-chip"
      data-status={status}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${style.chip}`}
    >
      <Icon size={13} strokeWidth={3} />
      {STATUS_WORDS[status]}
    </span>
  );
}

function Row({ label, status, detail }: { label: string; status: StatusLabel; detail: string }) {
  return (
    <li data-testid="status-item" data-status={status} className={`border-l-2 py-2 pl-3 ${STYLE[status].rail}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="min-w-0 text-sm font-bold text-ink">{label}</span>
        <Chip status={status} />
      </div>
      <p className="mt-1 text-sm leading-relaxed text-muted">{detail}</p>
    </li>
  );
}

/**
 * The signature view: one status per deal, in five groups, every line
 * labelled Verified, Unverified or Missing with the thing it was checked
 * against named in its own sentence.
 */
export function StatusView({ groups }: { groups: readonly StatusGroup[] }) {
  const counts = countStatuses(groups);
  return (
    <Panel
      title="Deal status"
      accent
      aside={
        <span className="flex shrink-0 flex-wrap justify-end gap-1" data-testid="status-counts">
          {(["verified", "unverified", "missing"] as const).map((status) =>
            counts[status] > 0 ? (
              <span key={status} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold ${STYLE[status].chip}`}>
                {counts[status]} {STATUS_WORDS[status].toLowerCase()}
              </span>
            ) : null,
          )}
        </span>
      }
    >
      <p className="rounded-lg bg-wash p-3 text-xs leading-relaxed text-muted" data-testid="status-legend">
        {STATUS_LEGEND}
      </p>
      <div className="mt-4 space-y-5">
        {groups.map((group) => (
          // A labelled group rather than a heading: the panel's own heading is the one in the page outline,
          // and a second "Payment ..." heading inside it would make the outline read as another panel.
          <div key={group.id} role="group" aria-labelledby={`status-${group.id}`} data-testid="status-group" data-group={group.id}>
            <p id={`status-${group.id}`} className="text-sm font-black uppercase tracking-wide text-navy">
              {group.title}
            </p>
            <ul className="mt-2 divide-y divide-line">
              {group.items.map((item) => (
                <Row key={item.id} label={item.label} status={item.status} detail={item.detail} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Panel>
  );
}
