import type { DealEvent, PaymentRecord } from "@pay-pals/contracts";
import { checkOrderHistory } from "@/lib/deal/order-history";
import type { PayPalReadResult } from "@/lib/deal/paypal-confirmation";
import { ConfirmedByPayPal } from "./ConfirmedByPayPal";
import { OrderHistoryPanel } from "./OrderHistoryPanel";

/**
 * The "Confirmed by PayPal" half, wherever payment is shown: the order as
 * PayPal returned it, and the history hash PayPal carries on it. The hash
 * check only renders for a live read, so neither block ever shows a value we
 * made up.
 */
export function PayPalConfirmation({
  read,
  payment,
  dealId,
  events,
  fallbackFields = true,
  prominent = false,
}: {
  read: PayPalReadResult;
  payment: PaymentRecord;
  dealId: string;
  events: readonly DealEvent[];
  fallbackFields?: boolean;
  prominent?: boolean;
}) {
  const check = read.kind === "confirmed" ? checkOrderHistory(read.order.customId, dealId, events) : null;
  return (
    <ConfirmedByPayPal result={read} payment={payment} fallbackFields={fallbackFields} prominent={prominent}>
      {check && read.kind === "confirmed" ? <OrderHistoryPanel check={check} events={events} orderId={read.order.orderId} /> : null}
    </ConfirmedByPayPal>
  );
}
