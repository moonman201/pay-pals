import type { DealEvent } from "@pay-pals/contracts";
import { historyLine, historyStatus } from "@/lib/deal/history-status";

interface Props {
  events: readonly DealEvent[];
  historyHash: string | null | undefined;
  /** A seeded example deal: its "order" is a fixture id, so PayPal holds nothing. Chained, not anchored. */
  example?: boolean;
  /**
   * Where `historyHash` came from. "payment_record" is our own copy, written
   * when the order was created. "live_order" is PayPal's custom_id, read back
   * from PayPal in this render, which is the stronger of the two.
   */
  source?: "payment_record" | "live_order";
  /** The order the hash was read from, for the tooltip. Only with source "live_order". */
  orderId?: string | null;
  className?: string;
}

function titleFor(source: "payment_record" | "live_order", historyHash: string | null | undefined, example: boolean, orderId: string | null): string {
  if (example) return "Example deal seeded from a scenario: no PayPal order holds this hash";
  if (!historyHash) return "No PayPal order yet";
  if (source === "live_order") return `Read from PayPal's custom_id on order ${orderId ?? "just now"}: ${historyHash}`;
  return `Hash on the PayPal order: ${historyHash}`;
}

/** A round seal: a ring of ticks with a check inside when the history verifies, a broken ring with a mark when it does not. */
function Seal({ verified }: { verified: boolean }) {
  const colour = verified ? "text-go" : "text-stop";
  return (
    <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden className={`shrink-0 ${colour}`}>
      <circle cx="16" cy="16" r="14" fill="currentColor" />
      <circle cx="16" cy="16" r="11" fill="none" stroke="var(--surface)" strokeWidth="1" strokeDasharray={verified ? "2 1.8" : "6 3"} />
      {verified ? (
        <path d="M10.5 16.5l3.5 3.5 7.5-8" fill="none" stroke="var(--surface)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M16 9.5v8M16 21.5v1" fill="none" stroke="var(--surface)" strokeWidth="2.5" strokeLinecap="round" />
      )}
    </svg>
  );
}

/**
 * The hash chain seal. Computed live from the stored events and the hash
 * recorded on the PayPal order: a green seal when it verifies, a red seal
 * when it does not, a plain chip before any order or on an example deal.
 */
export function HistoryBadge({ events, historyHash, example = false, source = "payment_record", orderId = null, className = "" }: Props) {
  const status = historyStatus(events, example ? null : historyHash);
  const line = example && status.kind === "unanchored" && status.chainOk ? `${historyLine(status)} (example deal, no PayPal order)` : historyLine(status);
  const bad = status.kind === "mismatch" || (status.kind === "unanchored" && !status.chainOk);
  const tone = status.kind === "verified" ? "border-go-line bg-go-soft text-go" : bad ? "border-stop-line bg-stop-soft text-stop font-bold" : "border-line bg-wash text-muted";
  return (
    /*
      A link, because the events it counts are the timeline, and a reader who
      wants to see them should not have to go looking (Matt's rule 1).
    */
    <a
      href="#timeline"
      role={status.kind === "mismatch" ? "alert" : undefined}
      data-testid="history-badge"
      data-status={status.kind}
      title={titleFor(source, example ? null : historyHash, example, orderId)}
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border py-0.5 pl-1 pr-2.5 text-xs font-semibold underline-offset-2 hover:underline ${tone} ${className}`}
    >
      {status.kind === "verified" || bad ? (
        <Seal verified={status.kind === "verified"} />
      ) : (
        <span aria-hidden className="ml-1.5 inline-block h-2 w-2 rounded-full border-2 border-current" />
      )}
      {line}
    </a>
  );
}
