import { RECORDED_HEADING } from "@/lib/deal/paypal-confirmation";
import { recordedByPayPals, type RecordedInput } from "@/lib/deal/recorded";

/**
 * The other half of the payment panel: what Pay Pals holds itself. Labelled
 * so nobody reads our record as PayPal's.
 */
export function RecordedByPayPals({ input, children }: { input: RecordedInput; children?: React.ReactNode }) {
  const lines = recordedByPayPals(input);
  return (
    <section data-testid="pay-pals-record" className="rounded-xl border border-line bg-wash p-4">
      <h3 className="text-sm font-bold text-ink">{RECORDED_HEADING}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted">Pay Pals keeps these. PayPal never saw them, apart from the locked card text that went on the order.</p>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {lines.map((line) => (
          <div key={line.label}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{line.label}</dt>
            <dd className="break-words">{line.value}</dd>
          </div>
        ))}
      </dl>
      {children}
    </section>
  );
}
