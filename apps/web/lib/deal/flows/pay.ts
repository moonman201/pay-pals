/**
 * Payment: create the PayPal order for the locked card, then capture it once
 * the buyer approves. The seller's PayPal email is the payee on the order.
 * PayPal's own responses are kept on the record as rawOrder and rawCapture.
 *
 * Pressing a second wallet button reuses the open order (the gateway's
 * PayPal-Request-Id is deterministic per deal and card version), so an open
 * payment is returned as is: no second payment_created event, and the method
 * stays what the first button said until the capture reports otherwise.
 */
import type { PaymentMethod, PaymentRecord } from "@pay-pals/contracts";
import type { Services } from "../../services";
import { nowIso } from "../../time";
import { FlowError } from "../errors";
import { expectState, mustDeal, mustLockedCard, note, say } from "./shared";

/** The gateway may attach PayPal's response as `raw`; keep it when it is a plain object. */
export function rawBody(result: object): Record<string, unknown> | null {
  const raw = (result as { raw?: unknown }).raw;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

/** The wallet PayPal says paid, read from a capture or order body's payment_source. Null when it does not say. */
export function fundingSourceOf(raw: Record<string, unknown> | null): PaymentMethod | null {
  const source = raw?.payment_source;
  if (!source || typeof source !== "object") return null;
  if ("venmo" in source) return "venmo";
  if ("paypal" in source) return "paypal";
  return null;
}

const OPEN_STATUSES: readonly PaymentRecord["status"][] = ["CREATED", "APPROVED"];

export async function createOrder(services: Services, dealId: string, method: PaymentMethod): Promise<PaymentRecord> {
  const deal = await mustDeal(services, dealId);
  expectState(deal, "AGREED", "PAYMENT_PENDING");

  const existing = await services.store.getPayment(dealId);
  if (existing && OPEN_STATUSES.includes(existing.status)) {
    if (existing.method !== null) return existing;
    return services.store.savePayment({ ...existing, method });
  }

  const card = await mustLockedCard(services, deal);
  // The head of the event hash chain goes into the PayPal order, so PayPal's record proves the history (Decision 9).
  const events = await services.store.listEvents(dealId);
  const historyHash = events[events.length - 1]?.hash ?? null;
  const order = await services.paypal.createDealOrder(card, dealId, { historyHash });
  const payment = await services.store.savePayment({
    dealId,
    paypalOrderId: order.orderId,
    captureId: null,
    status: "CREATED",
    payeeEmail: card.sellerPaypalEmail,
    amount: card.askingPrice,
    currency: "USD",
    method,
    createdAt: nowIso(),
    capturedAt: null,
    rawOrder: rawBody(order),
    rawCapture: null,
    historyHash,
  });
  await note(services, dealId, "payment_created", "paypal", `PayPal checkout order ${order.orderId} created, payee ${card.sellerPaypalEmail}.`, { orderId: order.orderId });
  if (deal.state === "AGREED") {
    await services.store.transition(dealId, "PAYMENT_PENDING", "system", "Payment pending.");
  }
  return payment;
}

export async function captureOrder(services: Services, dealId: string, orderId: string): Promise<PaymentRecord> {
  const deal = await mustDeal(services, dealId);
  expectState(deal, "PAYMENT_PENDING");
  const existing = await services.store.getPayment(dealId);
  if (!existing || existing.paypalOrderId !== orderId) throw new FlowError("That order does not belong to this deal.", 409);

  const capture = await services.paypal.captureOrder(orderId);
  const rawCapture = rawBody(capture);
  if (capture.status !== "COMPLETED" && capture.status !== "PENDING") {
    await services.store.savePayment({ ...existing, status: "FAILED", rawCapture });
    throw new FlowError(`PayPal reported the capture as ${capture.status}.`, 409);
  }
  const reported = fundingSourceOf(rawCapture);
  const payment = await services.store.savePayment({
    ...existing,
    captureId: capture.captureId,
    status: "CAPTURED",
    payeeEmail: capture.payeeEmail ?? existing.payeeEmail,
    method: reported ?? existing.method,
    capturedAt: nowIso(),
    rawCapture,
  });
  const via = payment.method === "venmo" ? " via Venmo" : "";
  await note(services, dealId, "payment_captured", "paypal", `Payment of $${payment.amount.toFixed(2)} captured${via}.`, { captureId: capture.captureId });
  await services.store.transition(dealId, "PAID", "system", "Paid.");
  await say(services, dealId, "buyer_pal", "buyer_pal", `Paid. $${payment.amount.toFixed(2)} went to ${payment.payeeEmail} as a Goods and Services payment, so PayPal purchase protection applies. I will look out for the tracking number.`);
  await say(services, dealId, "seller_pal", "seller_pal", "Payment captured. Time to pack. I have a short checklist for you in the shipping step.");
  return payment;
}
