/**
 * What the app is built on, and only what is real and running. Each line was checked against the
 * code on Oct 13; the file that backs it is named beside it so the next edit can check it again.
 * Nothing here names the PayPal Disputes API: the app receives the dispute webhook and calls no
 * disputes endpoint.
 */
export const BUILT_WITH: { id: string; line: string; backedBy: string }[] = [
  { id: "orders", line: "PayPal Orders v2: the order is created and captured on the server.", backedBy: "packages/paypal/src/gateway.ts" },
  { id: "webhooks", line: "PayPal webhooks, with the signature verified. That includes the dispute webhook.", backedBy: "packages/paypal/src/gateway.ts, packages/paypal/src/webhook-handler.ts" },
  { id: "buttons", line: "PayPal and Venmo buttons on the JavaScript SDK v6.", backedBy: "apps/web/components/pay/PayPalButtons.tsx" },
  { id: "claude", line: "Claude runs both pals.", backedBy: "packages/agents/src/claude/" },
  { id: "channel3", line: "Channel3 for retail prices.", backedBy: "packages/agents/src/price/channel3-api.ts" },
  { id: "psa", line: "Cert check against a demo PSA record. It is labelled demo wherever it shows.", backedBy: "packages/agents/src/cert/fixture-lookup.ts" },
  { id: "chain", line: "Tamper-evident history. Each event is hash-chained, and the chain head goes into the order's custom_id.", backedBy: "packages/contracts/src/history.ts, apps/web/lib/deal/flows/pay.ts" },
];

export function HowItsBuilt() {
  return (
    <section className="mt-12 sm:mt-16" aria-labelledby="built-title">
      <h2 id="built-title" className="text-2xl font-bold text-navy">
        How it&apos;s built
      </h2>
      <ul className="mt-4 grid gap-x-8 gap-y-2 text-sm leading-relaxed text-ink sm:grid-cols-2">
        {BUILT_WITH.map((item) => (
          <li key={item.id} data-built={item.id} className="flex gap-2">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
            <span className="min-w-0">{item.line}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
