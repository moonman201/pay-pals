"use client";

import type { PaymentMethod } from "@pay-pals/contracts";
import { useState } from "react";

interface Props {
  createOrder: (method: PaymentMethod) => Promise<string>;
  onApproved: (orderId: string, method: PaymentMethod) => Promise<void>;
  onError: (message: string) => void;
}

/**
 * Shown when NEXT_PUBLIC_PAYPAL_CLIENT_ID is not set. Clearly labelled demo
 * buttons that run the same server routes (create order, then capture)
 * against the mock gateway, so a judge can click through with no keys.
 */
export function PlaceholderPayButtons({ createOrder, onApproved, onError }: Props) {
  const [busy, setBusy] = useState<PaymentMethod | null>(null);

  async function pay(method: PaymentMethod) {
    setBusy(method);
    try {
      const orderId = await createOrder(method);
      await onApproved(orderId, method);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Payment failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div data-testid="placeholder-pay">
      <p className="mb-3 rounded-lg border border-dashed border-line bg-wash px-3 py-2 text-xs text-muted">
        Demo mode. No PayPal client id is set, so these buttons create and capture a mock order through the same routes the real buttons use.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => pay("paypal")}
          className="rounded-full bg-[#ffc439] px-6 py-2.5 text-sm font-bold text-[#003087] disabled:opacity-50"
        >
          {busy === "paypal" ? "Paying" : "Pay with PayPal (demo)"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => pay("venmo")}
          className="rounded-full bg-[#008cff] px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy === "venmo" ? "Paying" : "Pay with Venmo (demo)"}
        </button>
      </div>
    </div>
  );
}
