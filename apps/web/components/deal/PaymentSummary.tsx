import type { PaymentRecord } from "@pay-pals/contracts";
import { formatMoney, formatTime } from "@/lib/format";
import { Badge } from "../ui/Badge";
import { Panel } from "../ui/Panel";

/** The PayPal order for this deal: who got paid, how much, which capture. */
export function PaymentSummary({ payment }: { payment: PaymentRecord }) {
  const captured = payment.status === "CAPTURED";
  return (
    <Panel title="Payment" aside={<Badge tone={captured ? "go" : payment.status === "FAILED" ? "stop" : "neutral"}>{payment.status.toLowerCase()}</Badge>}>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Amount</dt>
          <dd className="font-semibold">{formatMoney(payment.amount, payment.currency)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Paid to</dt>
          <dd className="break-all">{payment.payeeEmail}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">PayPal order</dt>
          <dd className="font-mono text-xs">{payment.paypalOrderId}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Capture</dt>
          <dd className="font-mono text-xs">{payment.captureId ?? "pending"}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Method</dt>
          <dd>{payment.method === "venmo" ? "Venmo" : "PayPal"}, Goods and Services</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{captured ? "Captured" : "Created"}</dt>
          <dd>{formatTime(payment.capturedAt ?? payment.createdAt)}</dd>
        </div>
      </dl>
    </Panel>
  );
}
