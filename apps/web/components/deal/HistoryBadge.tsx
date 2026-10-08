import type { DealEvent } from "@pay-pals/contracts";
import { historyLine, historyStatus } from "@/lib/deal/history-status";

/**
 * The hash chain badge. Computed live from the stored events and the hash
 * recorded on the PayPal order: calm when it verifies, a clear warning when
 * it does not, a plain count before any order.
 */
export function HistoryBadge({ events, historyHash, className = "" }: { events: readonly DealEvent[]; historyHash: string | null | undefined; className?: string }) {
  const status = historyStatus(events, historyHash);
  const tone =
    status.kind === "verified"
      ? "border-emerald-200 bg-emerald-50 text-go"
      : status.kind === "mismatch" || (status.kind === "unanchored" && !status.chainOk)
        ? "border-red-300 bg-red-50 text-stop font-bold"
        : "border-line bg-wash text-muted";
  return (
    <span
      role={status.kind === "mismatch" ? "alert" : undefined}
      data-testid="history-badge"
      data-status={status.kind}
      title={historyHash ? `Hash on the PayPal order: ${historyHash}` : "No PayPal order yet"}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone} ${className}`}
    >
      <span aria-hidden className="text-[10px]">
        {status.kind === "verified" ? "verified" : status.kind === "mismatch" ? "warning" : "chain"}
      </span>
      {historyLine(status)}
    </span>
  );
}
