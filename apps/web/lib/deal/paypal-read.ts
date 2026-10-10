/**
 * The one live read: GET the order from PayPal while the page renders, so
 * "Confirmed by PayPal" sits over PayPal's own values and not over ours.
 * A read that fails is reported as a failed read; it never throws into the
 * page.
 */
import type { PaymentRecord } from "@pay-pals/contracts";
import { planOrderRead, readOrderFields, type PayPalReadResult } from "./paypal-confirmation";

export interface OrderReader {
  getOrder(orderId: string): Promise<Record<string, unknown>>;
}

export async function readPayPalOrder(
  paypal: OrderReader,
  payment: PaymentRecord | null,
  payMode: "sandbox" | "mock",
  log: (line: string) => void = (line) => console.warn(line),
): Promise<PayPalReadResult> {
  const plan = planOrderRead(payment, payMode);
  if (plan.kind === "skip") return plan.result;
  try {
    const order = await paypal.getOrder(plan.orderId);
    return { kind: "confirmed", order: readOrderFields(order) };
  } catch (error) {
    // The reason stays in the server log. The page says only that the read did not come back.
    log(`[pay-pals] paypal: live read of order ${plan.orderId} did not come back (${error instanceof Error ? error.message : String(error)})`);
    return { kind: "failed" };
  }
}
