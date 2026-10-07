"use client";

import type { PaymentMethod } from "@pay-pals/contracts";
import { useEffect, useRef, useState } from "react";
import { PlaceholderPayButtons } from "./PlaceholderPayButtons";

/** Sandbox only. This repo never talks to live PayPal. */
const SDK_URL = "https://www.sandbox.paypal.com/web-sdk/v6/core";

interface Props {
  clientId: string | null;
  amount: number;
  createOrder: (method: PaymentMethod) => Promise<string>;
  onApproved: (orderId: string, method: PaymentMethod) => Promise<void>;
  onError: (message: string) => void;
}

function loadSdk(): Promise<void> {
  if (window.paypal) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("Could not load the PayPal SDK.")));
    if (!existing) {
      script.src = SDK_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

/**
 * PayPal and Venmo buttons on the PayPal JS SDK v6. The server creates the
 * order (payee = seller) and captures it after approval. Without a client id
 * the placeholder buttons render instead.
 */
export function PayPalButtons({ clientId, amount, createOrder, onApproved, onError }: Props) {
  const [eligible, setEligible] = useState<{ paypal: boolean; venmo: boolean } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const sessions = useRef<{ paypal?: PayPalPaymentSession; venmo?: PayPalPaymentSession }>({});

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      try {
        await loadSdk();
        if (!window.paypal) throw new Error("PayPal SDK did not initialise.");
        // Wallet buttons only, never "card-fields": the payee may be a personal PayPal account, which cannot take direct card funding (Lane 0).
        const sdk = await window.paypal.createInstance({ clientId, components: ["paypal-payments", "venmo-payments"], pageType: "checkout" });
        const methods = await sdk.findEligibleMethods({ currencyCode: "USD", amount: amount.toFixed(2) });
        const make = (method: PaymentMethod): PayPalSessionOptions => ({
          onApprove: (data) => onApproved(data.orderId, method),
          onCancel: () => onError("Payment cancelled."),
          onError: (err) => onError(err.message ?? "PayPal reported an error."),
        });
        sessions.current.paypal = sdk.createPayPalOneTimePaymentSession(make("paypal"));
        sessions.current.venmo = sdk.createVenmoOneTimePaymentSession(make("venmo"));
        if (!cancelled) setEligible({ paypal: methods.isEligible("paypal"), venmo: methods.isEligible("venmo") });
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not set up PayPal.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, amount, onApproved, onError]);

  if (!clientId) return <PlaceholderPayButtons createOrder={createOrder} onApproved={onApproved} onError={onError} />;
  if (loadError) return <p className="text-sm text-stop">{loadError}</p>;
  if (!eligible) return <p className="text-sm text-muted">Loading PayPal.</p>;

  const start = (method: PaymentMethod) => {
    const session = sessions.current[method];
    if (!session) return;
    void session.start({ presentationMode: "auto" }, createOrder(method).then((orderId) => ({ orderId }))).catch((e: unknown) => {
      onError(e instanceof Error ? e.message : "Payment did not start.");
    });
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      {eligible.paypal ? <paypal-button type="pay" onClick={() => start("paypal")} /> : null}
      {eligible.venmo ? <venmo-button type="pay" onClick={() => start("venmo")} /> : null}
      {!eligible.paypal && !eligible.venmo ? <p className="text-sm text-muted">No eligible payment method for this buyer.</p> : null}
    </div>
  );
}
