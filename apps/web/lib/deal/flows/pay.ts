/**
 * Payment: create the PayPal order for the locked card, then capture it once
 * the buyer approves. The seller's PayPal email is the payee on the order.
 */
import type { PaymentMethod, PaymentRecord } from "@pay-pals/contracts";
import { nowIso } from "../../mocks/ids";
import type { Services } from "../../services";
import { FlowError } from "../errors";
import { expectState, mustDeal, mustLockedCard, note, say } from "./shared";

export async function createOrder(services: Services, dealId: string, method: PaymentMethod): Promise<PaymentRecord> {
  const deal = await mustDeal(services, dealId);
  expectState(deal, "AGREED", "PAYMENT_PENDING");
  const card = await mustLockedCard(services, deal);

  const order = await services.paypal.createDealOrder(card, dealId);
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
  });
  await note(services, dealId, "payment_created", "paypal", `PayPal checkout order created, payee ${card.sellerPaypalEmail}.`, { orderId: order.orderId });
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
  if (capture.status !== "COMPLETED" && capture.status !== "PENDING") {
    await services.store.savePayment({ ...existing, status: "FAILED" });
    throw new FlowError(`PayPal reported the capture as ${capture.status}.`, 409);
  }
  const payment = await services.store.savePayment({
    ...existing,
    captureId: capture.captureId,
    status: "CAPTURED",
    payeeEmail: capture.payeeEmail ?? existing.payeeEmail,
    capturedAt: nowIso(),
  });
  const via = payment.method === "venmo" ? " via Venmo" : "";
  await note(services, dealId, "payment_captured", "paypal", `Payment of $${payment.amount.toFixed(2)} captured${via}.`, { captureId: capture.captureId });
  await services.store.transition(dealId, "PAID", "system", "Paid.");
  await say(services, dealId, "buyer_pal", "buyer_pal", `Paid. $${payment.amount.toFixed(2)} went to ${payment.payeeEmail} as a Goods and Services payment, so PayPal purchase protection applies. I will watch for the tracking number.`);
  await say(services, dealId, "seller_pal", "seller_pal", "Payment captured. Time to pack. I have a short checklist for you in the shipping step.");
  return payment;
}
