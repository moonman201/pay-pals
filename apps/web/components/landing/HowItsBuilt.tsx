"use client";

import { ChipDeck, type DeckItem } from "../ui/ChipDeck";

/**
 * What the app is built on, and only what is real and running. Each line was checked against the
 * code on Oct 13; the file that backs it is named beside it so the next edit can check it again.
 * Nothing here names the PayPal Disputes API: the app receives the dispute webhook and calls no
 * disputes endpoint.
 *
 * `short` is the chip on the page. `line` is the sentence behind it, one tap away and unchanged.
 */
export const BUILT_WITH: { id: string; short: string; line: string; backedBy: string }[] = [
  { id: "orders", short: "Orders v2", line: "PayPal Orders v2: the order is created and captured on the server.", backedBy: "packages/paypal/src/gateway.ts" },
  { id: "webhooks", short: "Webhooks", line: "PayPal webhooks, with the signature verified. That includes the dispute webhook.", backedBy: "packages/paypal/src/gateway.ts, packages/paypal/src/webhook-handler.ts" },
  { id: "buttons", short: "PayPal and Venmo", line: "PayPal and Venmo buttons on the JavaScript SDK v6.", backedBy: "apps/web/components/pay/PayPalButtons.tsx" },
  { id: "claude", short: "Claude", line: "Claude runs both pals.", backedBy: "packages/agents/src/claude/" },
  { id: "channel3", short: "Channel3", line: "Channel3 for retail prices.", backedBy: "packages/agents/src/price/channel3-api.ts" },
  { id: "psa", short: "Demo PSA record", line: "Cert check against a demo PSA record. It is labelled demo wherever it shows.", backedBy: "packages/agents/src/cert/fixture-lookup.ts" },
  { id: "chain", short: "Hash-chained history", line: "Tamper-evident history. Each event is hash-chained, and the chain head goes into the order's custom_id.", backedBy: "packages/contracts/src/history.ts, apps/web/lib/deal/flows/pay.ts" },
];

export function HowItsBuilt() {
  const items: DeckItem[] = BUILT_WITH.map((item) => ({
    id: item.id,
    testId: `built-${item.id}`,
    data: { built: item.id },
    chip: item.short,
    chipClass: "border-line bg-surface text-ink hover:bg-wash",
    detail: <p className="text-sm leading-relaxed text-ink">{item.line}</p>,
  }));
  return (
    <section className="mt-12 sm:mt-16" aria-labelledby="built-title">
      <h2 id="built-title" className="text-base font-bold text-navy">
        How it&apos;s built
      </h2>
      <div className="mt-3">
        <ChipDeck items={items} label="What Pay Pals is built on. Tap one for the detail." slotClassName="mt-3 rounded-xl border border-line bg-wash px-4 py-3" />
      </div>
    </section>
  );
}
