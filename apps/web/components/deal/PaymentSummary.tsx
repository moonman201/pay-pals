import type { PaymentRecord } from "@pay-pals/contracts";
import type { PayPalReadResult } from "@/lib/deal/paypal-confirmation";
import type { RecordedInput } from "@/lib/deal/recorded";
import { Badge } from "../ui/Badge";
import { Panel } from "../ui/Panel";
import { ConfirmedByPayPal } from "./ConfirmedByPayPal";
import { RecordedByPayPals } from "./RecordedByPayPals";

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

interface Props {
  payment: PaymentRecord;
  /** The live GET order for this payment, done while the page rendered. */
  read: PayPalReadResult;
  /** What Pay Pals holds itself, for the second half of the panel. */
  record: RecordedInput;
  /** The hash check on the live order, when there is one. */
  historyCheck?: React.ReactNode;
}

/**
 * The payment panel, in two labelled halves: what PayPal confirms when we
 * read the order back, and what Pay Pals recorded on its own.
 */
export function PaymentSummary({ payment, read, record, historyCheck }: Props) {
  const captured = payment.status === "CAPTURED";
  const approve = approveLink(payment);
  return (
    <Panel title="Payment" aside={<Badge tone={captured ? "go" : payment.status === "FAILED" ? "stop" : "neutral"}>{payment.status.toLowerCase()}</Badge>}>
      {approve ? (
        <p className="mb-3 text-sm">
          The order is waiting for the buyer&apos;s approval.{" "}
          <a href={approve} target="_blank" rel="noreferrer" className="font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline">
            Approve it in the PayPal sandbox
          </a>
          , then press &quot;I approved in PayPal, capture now&quot; in the pay panel.
        </p>
      ) : null}
      <div className="space-y-3">
        <ConfirmedByPayPal result={read} payment={payment} />
        {historyCheck}
        <RecordedByPayPals input={record} />
      </div>
    </Panel>
  );
}
