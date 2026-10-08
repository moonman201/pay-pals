"use client";

import type { ItemCard, PaymentMethod, PaymentRecord } from "@pay-pals/contracts";
import { useState } from "react";
import { dealApi, postJson } from "@/lib/client/api";
import { formatMoney } from "@/lib/format";
import { PayPalButtons } from "../../pay/PayPalButtons";
import { Button } from "../../ui/Button";
import { SandboxBuyerNote } from "./SandboxBuyerNote";
import { StepError, StepPanel } from "./StepPanel";

interface Props {
  dealId: string;
  card: ItemCard;
  /** From the server. When the gateway is a mock, the demo buttons show even if a public client id is built in. */
  payMode: "sandbox" | "mock";
  /** An order already created for this deal and not yet captured. */
  payment?: PaymentRecord | null;
  /** The PayPal sandbox test buyer, on demo deals through the sandbox gateway only. */
  sandboxBuyer?: { email: string; password: string } | null;
  onDone: () => void;
}

/** Pay the locked card. Creates the PayPal order server side, captures it after approval. */
export function PayStep({ dealId, card, payMode, payment = null, sandboxBuyer = null, onDone }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const clientId = payMode === "sandbox" ? (process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? null) : null;
  const open = payment && (payment.status === "CREATED" || payment.status === "APPROVED") ? payment : null;

  async function createOrder(method: PaymentMethod): Promise<string> {
    const created = await postJson<PaymentRecord>(dealApi(dealId, "order"), { method });
    return created.paypalOrderId;
  }

  async function capture(orderId: string): Promise<void> {
    await postJson(dealApi(dealId, "capture"), { orderId });
    onDone();
  }

  async function captureOpen() {
    if (!open) return;
    setCapturing(true);
    setError(null);
    try {
      await capture(open.paypalOrderId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Capture failed.");
    } finally {
      setCapturing(false);
    }
  }

  return (
    <StepPanel
      id="pay"
      title="Pay"
      intro={`${formatMoney(card.askingPrice, card.currency)} to ${card.sellerPaypalEmail} as a PayPal Goods and Services payment. The order carries the locked card: ${card.title}${card.serial ? `, serial ${card.serial}` : ""}.`}
    >
      {sandboxBuyer ? <SandboxBuyerNote email={sandboxBuyer.email} password={sandboxBuyer.password} /> : null}
      <PayPalButtons clientId={clientId} amount={card.askingPrice} createOrder={createOrder} onApproved={capture} onError={setError} />
      {open ? (
        <div className="mt-4 rounded-lg border border-line bg-wash p-3 text-sm" data-testid="capture-open">
          <p>
            Order {open.paypalOrderId} is waiting for your approval in PayPal. If you approved it in another window, capture it here.
          </p>
          <Button variant="secondary" className="mt-2" disabled={capturing} onClick={captureOpen}>
            {capturing ? "Capturing" : "I approved in PayPal, capture now"}
          </Button>
        </div>
      ) : null}
      <div className="mt-3">
        <StepError error={error} />
      </div>
    </StepPanel>
  );
}
