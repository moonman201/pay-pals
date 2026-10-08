import type { DealEvent } from "@pay-pals/contracts";
import { historyLine, historyStatus } from "@/lib/deal/history-status";

interface Props {
  events: readonly DealEvent[];
  historyHash: string | null | undefined;
  /** A seeded example deal: its "order" is a fixture id, so PayPal holds nothing. Chained, not anchored. */
  example?: boolean;
  className?: string;
}

/**
 * The hash chain badge. Computed live from the stored events and the hash
 * recorded on the PayPal order: calm when it verifies, a clear warning when
 * it does not, a plain count before any order or on an example deal.
 */
export function HistoryBadge({ events, historyHash, example = false, className = "" }: Props) {
  const status = historyStatus(events, example ? null : historyHash);
  const line = example && status.kind === "unanchored" && status.chainOk ? `${historyLine(status)} (example deal, no PayPal order)` : historyLine(status);
  const tone =
    status.kind === "verified"
      ? "border-go-line bg-go-soft text-go"
      : status.kind === "mismatch" || (status.kind === "unanchored" && !status.chainOk)
        ? "border-stop-line bg-stop-soft text-stop font-bold"
        : "border-line bg-wash text-muted";
  return (
    <span
      role={status.kind === "mismatch" ? "alert" : undefined}
      data-testid="history-badge"
      data-status={status.kind}
      title={example ? "Example deal seeded from a scenario: no PayPal order holds this hash" : historyHash ? `Hash on the PayPal order: ${historyHash}` : "No PayPal order yet"}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone} ${className}`}
    >
      <span aria-hidden className="text-[10px]">
        {status.kind === "verified" ? "verified" : status.kind === "mismatch" ? "warning" : "chain"}
      </span>
      {line}
    </span>
  );
}
