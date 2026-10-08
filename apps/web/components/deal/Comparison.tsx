import { CautionIcon, CheckIcon, StopIcon } from "../ui/icons";

export type ComparisonStatus = "match" | "mismatch" | "unknown";

export interface ComparisonRow {
  label: string;
  left: string;
  right: string;
  status: ComparisonStatus;
  /** Shown under the row, for example the pal's reason for a mismatch. */
  note?: string | null;
  mono?: boolean;
}

const ROW_STYLE: Record<ComparisonStatus, string> = {
  match: "bg-go-soft text-ink",
  mismatch: "bg-stop-soft text-ink",
  unknown: "bg-wash text-muted",
};

const RIGHT_STYLE: Record<ComparisonStatus, string> = {
  match: "text-go",
  mismatch: "text-stop font-bold",
  unknown: "text-muted",
};

function StatusMark({ status }: { status: ComparisonStatus }) {
  if (status === "match") return <CheckIcon size={16} className="text-go" />;
  if (status === "mismatch") return <StopIcon size={16} className="text-stop" />;
  return <CautionIcon size={16} className="text-muted" />;
}

/**
 * Two columns, one row per field: what one record says against what the
 * other says. Mismatched rows sit on the stop colour, matches on go, and a
 * row nobody could read stays neutral. A table, so a reader with a screen
 * reader hears the pairs.
 */
export function Comparison({ leftTitle, rightTitle, rows, caption }: { leftTitle: string; rightTitle: string; rows: ComparisonRow[]; caption: string }) {
  return (
    <table className="mt-3 w-full border-separate border-spacing-y-1 text-left text-sm" data-testid="comparison">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="text-xs text-muted">
          <th scope="col" className="w-24 px-2 py-1 font-semibold">
            Field
          </th>
          <th scope="col" className="px-2 py-1 font-semibold">
            {leftTitle}
          </th>
          <th scope="col" className="px-2 py-1 font-semibold">
            {rightTitle}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className={`rounded-lg ${ROW_STYLE[row.status]}`} data-status={row.status}>
            <th scope="row" className="rounded-l-lg px-2 py-2 align-top text-xs font-semibold">
              <span className="inline-flex items-center gap-1.5">
                <StatusMark status={row.status} />
                {row.label}
              </span>
            </th>
            <td className={`px-2 py-2 align-top ${row.mono ? "font-mono text-xs" : ""}`}>{row.left}</td>
            <td className={`rounded-r-lg px-2 py-2 align-top ${RIGHT_STYLE[row.status]} ${row.mono ? "font-mono text-xs" : ""}`}>
              {row.right}
              {row.note ? <span className="mt-1 block text-xs font-normal text-muted">{row.note}</span> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
