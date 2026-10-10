import { RECORDED_HEADING } from "@/lib/deal/paypal-confirmation";

/**
 * The divider between the evidence pack's two halves. The first half is the
 * payment block, which carries its own heading from describeRead so the words
 * "Confirmed by PayPal" never appear over values PayPal did not return. This
 * is the second half: everything Pay Pals holds on its own.
 */
export function RecordedPartHeading() {
  return (
    <header className="break-inside-avoid rounded-xl border border-line bg-wash p-4">
      <h2 className="text-lg font-black tracking-tight text-navy">{RECORDED_HEADING}</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink">
        Everything below is Pay Pals&apos; own record: the item card, the photos, the chat and the pal checks. PayPal never saw it, apart from the locked card text that went
        on the order.
      </p>
    </header>
  );
}
