import type { PaymentRecord } from "@pay-pals/contracts";
import { formatMoney, formatTime } from "@/lib/format";
import { Badge } from "../ui/Badge";
import { Panel } from "../ui/Panel";

/** PayPal's approval link from the saved order body, when the order is still waiting for the buyer. */
function approveLink(payment: PaymentRecord): string | null {
  if (payment.status !== "CREATED" && payment.status !== "APPROVED") return null;
  const links = payment.rawOrder?.links;
  if (!Array.isArray(links)) return null;
  for (const link of links as { rel?: unknown; href?: unknown }[]) {
    if ((link.rel === "payer-action" || link.rel === "approve") && typeof link.href === "string") return link.href;
  }
  return null;
}

/** A fixture payment on a seeded example deal: there is no PayPal order behind it. */
export function isExamplePayment(payment: PaymentRecord): boolean {
  return payment.paypalOrderId.startsWith("FIXTURE-");
}

/** The PayPal order for this deal: who got paid, how much, which capture. */
export function PaymentSummary({ payment }: { payment: PaymentRecord }) {
  const captured = payment.status === "CAPTURED";
  const approve = approveLink(payment);
  const example = isExamplePayment(payment);
  return (
    <Panel title="Payment" aside={<Badge tone={captured ? "go" : payment.status === "FAILED" ? "stop" : "neutral"}>{payment.status.toLowerCase()}</Badge>}>
      {example ? <p className="mb-3 text-xs text-muted">Example deal seeded from a scenario. These ids are placeholders; no PayPal order was created.</p> : null}
      {approve ? (
        <p className="mb-3 text-sm">
          The order is waiting for the buyer&apos;s approval.{" "}
          <a href={approve} target="_blank" rel="noreferrer" className="font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline">
            Approve it in the PayPal sandbox
          </a>
          , then press &quot;I approved in PayPal, capture now&quot; in the pay panel.
        </p>
      ) : null}
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
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{example ? "Example order id" : "PayPal order"}</dt>
          <dd className="font-mono text-xs">{payment.paypalOrderId}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{example ? "Example capture id" : "Capture"}</dt>
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
