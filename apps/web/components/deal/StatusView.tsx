import { countStatuses, splitUnreached, STATUS_LEGEND, STATUS_WORDS, type StatusGroup, type StatusLabel, type StatusNote } from "@/lib/deal/status-view";
import type { Deal } from "@pay-pals/contracts";
import { Panel } from "../ui/Panel";
import { TAP_LINK } from "../ui/tap";
import { CautionIcon, CheckIcon, StopIcon } from "../ui/icons";

const STYLE: Record<StatusLabel, { chip: string; rail: string; icon: typeof CheckIcon }> = {
  verified: { chip: "border-go-line bg-go-soft text-go", rail: "border-l-go-line", icon: CheckIcon },
  // Flagged wears the stop colour, because it is the one label that says a check came back against the seller.
  flagged: { chip: "border-stop-line bg-stop-soft text-stop", rail: "border-l-stop-line", icon: StopIcon },
  unverified: { chip: "border-caution-line bg-caution-soft text-caution", rail: "border-l-caution-line", icon: CautionIcon },
  missing: { chip: "border-line bg-wash text-muted", rail: "border-l-line", icon: StopIcon },
};

const ORDER = ["flagged", "verified", "unverified", "missing"] as const;

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

/** Where a row used to be: what it said, counted, and a link to the panel that says it in full. */
function Note({ note }: { note: StatusNote }) {
  return (
    <p className="mt-2 text-sm leading-relaxed text-muted" data-testid="status-note">
      {note.text}{" "}
      <a href={note.href} className={`${TAP_LINK} font-semibold text-[var(--accent-ink)] underline underline-offset-2`}>
        {note.linkText}
      </a>
      .
    </p>
  );
}

/**
 * The signature view: one status per deal, in groups, every line labelled
 * Verified, Flagged, Unverified or Missing with the thing it was checked
 * against named in its own sentence.
 *
 * Two things keep it short without hiding anything. Rows whose sentences the
 * review panel already prints are counted and linked instead of repeated,
 * and trailing stages nobody reached collapse to one line.
 */
export function StatusView({ groups, deal }: { groups: readonly StatusGroup[]; deal: Pick<Deal, "state"> }) {
  const { shown, skipped } = splitUnreached(groups, deal);
  // Counted over what is on the page, so the chips and the rows can always be reconciled by eye.
  const counts = countStatuses(shown);
  return (
    <Panel
      title="Deal status"
      accent
      aside={
        <span className="flex min-w-0 flex-wrap gap-1" data-testid="status-counts">
          {ORDER.map((status) =>
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
        {shown.map((group) => (
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
            {group.note ? <Note note={group.note} /> : null}
          </div>
        ))}
        {skipped ? (
          <p className="rounded-lg bg-wash p-3 text-sm leading-relaxed text-muted" data-testid="status-skipped">
            <span className="font-bold text-ink">Not reached: {skipped.names}.</span> {skipped.because}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
