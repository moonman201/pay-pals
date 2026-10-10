import type { PaymentRecord } from "@pay-pals/contracts";
import { describeRead, type PayPalReadResult } from "@/lib/deal/paypal-confirmation";
import { formatMoney, formatTime } from "@/lib/format";

interface Props {
  result: PayPalReadResult;
  /** Our own record, shown only when the live read did not give us PayPal's values. */
  payment: PaymentRecord;
  /**
   * Print our own values here when the read did not confirm. True in the
   * deal room, where this is the only payment block. False on the evidence
   * pack, which prints our record in its own half of the page.
   */
  fallbackFields?: boolean;
  /** Heading at part size, for the evidence pack where this block is one of the page's two halves. */
  prominent?: boolean;
  children?: React.ReactNode;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

/**
 * The payment values and where they came from. The heading says
 * "Confirmed by PayPal" only when a live GET order answered while this page
 * rendered. Otherwise it names what we do have, and the values below it are
 * ours.
 */
export function ConfirmedByPayPal({ result, payment, fallbackFields = true, prominent = false, children }: Props) {
  const described = describeRead(result);
  const example = result.kind === "example";
  const headingSize = prominent ? "text-lg font-black tracking-tight" : "text-sm font-bold";
  const noteSize = prominent ? "text-sm text-ink" : "text-xs text-muted";
  return (
    <section
      data-testid="paypal-confirmation"
      data-confirmed={described.confirmed ? "true" : "false"}
      className={`break-inside-avoid rounded-xl border p-4 ${described.confirmed ? "border-go-line bg-go-soft" : "border-line bg-wash"}`}
    >
      <h3 className={`${headingSize} ${described.confirmed ? "text-go" : "text-navy"}`}>{described.heading}</h3>
      <p className={`mt-1 leading-relaxed ${noteSize}`}>{described.note}</p>
      {result.kind === "confirmed" ? (
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Field label="PayPal order">
            <span className="font-mono text-xs">{result.order.orderId}</span>
          </Field>
          <Field label="Order status">{result.order.status || "not stated"}</Field>
          <Field label="Capture">
            <span className="font-mono text-xs">{result.order.captureId ?? "no capture on the order"}</span>
          </Field>
          <Field label="Capture status">{result.order.captureStatus ?? "no capture on the order"}</Field>
          <Field label="Amount">{result.order.amount ? `${result.order.amount} ${result.order.currency ?? ""}`.trim() : "not stated"}</Field>
          <Field label="Payee">{result.order.payeeEmail ?? "not stated"}</Field>
          <Field label="Created at PayPal">{result.order.createTime ? formatTime(result.order.createTime) : "not stated"}</Field>
          <Field label="Last updated at PayPal">{result.order.updateTime ? formatTime(result.order.updateTime) : "not stated"}</Field>
        </dl>
      ) : fallbackFields && result.kind !== "none" ? (
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Field label={example ? "Example order id" : "PayPal order"}>
            <span className="font-mono text-xs">{payment.paypalOrderId}</span>
          </Field>
          <Field label="Status we recorded">{payment.status.toLowerCase()}</Field>
          <Field label={example ? "Example capture id" : "Capture"}>
            <span className="font-mono text-xs">{payment.captureId ?? "none recorded"}</span>
          </Field>
          <Field label="Amount we recorded">{formatMoney(payment.amount, payment.currency)}</Field>
          <Field label="Payee we recorded">{payment.payeeEmail}</Field>
          <Field label={payment.capturedAt ? "Captured, by our clock" : "Created, by our clock"}>{formatTime(payment.capturedAt ?? payment.createdAt)}</Field>
        </dl>
      ) : null}
      {children}
    </section>
  );
}
