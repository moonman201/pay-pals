"use client";

import type { ItemCard, PaymentMethod, PaymentRecord } from "@pay-pals/contracts";
import { useState } from "react";
import { dealApi, postJson } from "@/lib/client/api";
import { formatMoney } from "@/lib/format";
import { PayPalButtons } from "../../pay/PayPalButtons";
import { StepError, StepPanel } from "./StepPanel";

/** Pay the locked card. Creates the PayPal order server side, captures it after approval. */
export function PayStep({ dealId, card, onDone }: { dealId: string; card: ItemCard; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? null;

  async function createOrder(method: PaymentMethod): Promise<string> {
    const payment = await postJson<PaymentRecord>(dealApi(dealId, "order"), { method });
    return payment.paypalOrderId;
  }

  async function capture(orderId: string): Promise<void> {
    await postJson(dealApi(dealId, "capture"), { orderId });
    onDone();
  }

  return (
    <StepPanel
      id="pay"
      title="Pay"
      intro={`${formatMoney(card.askingPrice, card.currency)} to ${card.sellerPaypalEmail} as a PayPal Goods and Services payment. The order carries the locked card: ${card.title}${card.serial ? `, serial ${card.serial}` : ""}.`}
    >
      <PayPalButtons clientId={clientId} amount={card.askingPrice} createOrder={createOrder} onApproved={capture} onError={setError} />
      <div className="mt-3">
        <StepError error={error} />
      </div>
    </StepPanel>
  );
}
