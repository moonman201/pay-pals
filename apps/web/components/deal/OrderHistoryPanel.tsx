import type { DealEvent } from "@pay-pals/contracts";
import { dealIdWarning, orderHistoryLine, type OrderHistory } from "@/lib/deal/order-history";
import { HistoryBadge } from "./HistoryBadge";

/**
 * The deal's history hash as PayPal holds it, next to the check that the
 * stored timeline still reproduces it. Only rendered for a live read of the
 * order, so every value here is one PayPal returned.
 */
export function OrderHistoryPanel({ check, events, orderId }: { check: OrderHistory; events: readonly DealEvent[]; orderId: string }) {
  const warning = dealIdWarning(check);
  return (
    <div data-testid="order-history" className="mt-4 border-t border-go-line pt-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Deal history hash, in PayPal&apos;s record of this order</h4>
      <p className="mt-1 text-xs leading-relaxed text-muted">custom_id on the order, exactly as PayPal returned it:</p>
      <p data-testid="order-custom-id" className="mt-1 break-all font-mono text-xs">
        {check.customId}
      </p>
      <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-semibold uppercase tracking-wide text-muted">Deal id on the order</dt>
          <dd className="break-all font-mono">{check.dealIdOnOrder}</dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-wide text-muted">History hash on the order</dt>
          <dd className="break-all font-mono">{check.historyHash ?? "none"}</dd>
        </div>
      </dl>
      <div className="mt-3">
        <HistoryBadge events={events} historyHash={check.historyHash} source="live_order" orderId={orderId} />
      </div>
      <p className="mt-2 text-sm leading-relaxed">{orderHistoryLine(check)}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        The chain is the official record of the deal, and the thing PayPal can check first, because its head is on PayPal&apos;s own order. A dispute or a refund does not
        depend on it.
      </p>
      {warning ? (
        <p role="alert" className="mt-2 text-sm font-semibold text-stop">
          {warning}
        </p>
      ) : null}
    </div>
  );
}
