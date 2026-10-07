/**
 * Maps the three PayPal webhook events Pay Pals cares about onto store
 * updates. Idempotent: each PayPal event id is handled once, recorded in
 * webhook receipts after the update succeeds so a failed attempt is retried
 * when PayPal redelivers.
 *
 * Signature verification happens before this, in the API route, with
 * PayPalGateway.verifyWebhook.
 */
import type { DealStore, PaymentRecord, WebhookEvent } from "@pay-pals/contracts";

/** Same shape packages/db exports as WebhookReceiptStore. Declared here so this package depends on contracts only. */
export interface WebhookReceipts {
  hasWebhookReceipt(eventId: string): Promise<boolean>;
  recordWebhookReceipt(eventId: string, eventType: string): Promise<boolean>;
}

export type WebhookStore = DealStore & WebhookReceipts;

export interface WebhookOutcome {
  eventId: string;
  eventType: string;
  /** False when the event was a duplicate or did not match a known payment. */
  handled: boolean;
  duplicate: boolean;
  dealId: string | null;
  /** One plain sentence for logs. */
  note: string;
}

type Res = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const money = (p: PaymentRecord) => `$${p.amount.toFixed(2)}`;

async function onOrderApproved(resource: Res, store: WebhookStore): Promise<[boolean, string | null, string]> {
  const orderId = str(resource.id);
  const payment = orderId ? await store.getPaymentByOrderId(orderId) : null;
  if (!payment) return [false, null, `No payment found for approved order ${orderId ?? "(missing id)"}.`];
  if (payment.status === "CREATED") await store.savePayment({ ...payment, status: "APPROVED" });
  return [true, payment.dealId, `Order ${orderId} approved by the buyer.`];
}

async function onCaptureCompleted(resource: Res, event: WebhookEvent, store: WebhookStore): Promise<[boolean, string | null, string]> {
  const captureId = str(resource.id);
  const related = (resource.supplementary_data as Res | undefined)?.related_ids as Res | undefined;
  const orderId = str(related?.order_id);
  const dealIdHint = str(resource.custom_id) ?? str(resource.invoice_id);
  const payment = (orderId ? await store.getPaymentByOrderId(orderId) : null) ?? (dealIdHint ? await store.getPayment(dealIdHint) : null);
  if (!payment || !captureId) return [false, dealIdHint, `No payment found for capture ${captureId ?? "(missing id)"}.`];

  if (payment.status !== "CAPTURED" || payment.captureId !== captureId) {
    await store.savePayment({
      ...payment,
      status: "CAPTURED",
      captureId,
      capturedAt: str(resource.create_time) ?? event.create_time,
    });
  }

  const deal = await store.getDeal(payment.dealId);
  if (!deal) return [false, payment.dealId, `Payment ${payment.paypalOrderId} points at a missing deal.`];
  if (deal.state !== "PAYMENT_PENDING") {
    return [true, deal.id, `Capture ${captureId} recorded; deal already ${deal.state}, no transition.`];
  }
  await store.appendEvent({
    dealId: deal.id,
    kind: "payment_captured",
    actor: "paypal",
    summary: `Payment of ${money(payment)} captured.`,
    data: { captureId, paypalOrderId: payment.paypalOrderId, paypalTime: event.create_time },
    at: new Date().toISOString(),
  });
  await store.transition(deal.id, "PAID", "system", "Paid.");
  return [true, deal.id, `Capture ${captureId} recorded; deal moved to PAID.`];
}

async function onDisputeCreated(resource: Res, event: WebhookEvent, store: WebhookStore): Promise<[boolean, string | null, string]> {
  const disputeId = str(resource.dispute_id) ?? str(resource.id) ?? "(unknown)";
  const tx = ((resource.disputed_transactions as Res[] | undefined) ?? [])[0] ?? {};
  const dealId = str(tx.custom) ?? str(tx.invoice_number);
  const payment = dealId ? await store.getPayment(dealId) : null;
  if (!payment) return [false, dealId, `Dispute ${disputeId} does not match a Pay Pals deal.`];

  if (payment.status !== "DISPUTED") await store.savePayment({ ...payment, status: "DISPUTED" });
  const deal = await store.getDeal(payment.dealId);
  if (!deal) return [false, payment.dealId, `Payment ${payment.paypalOrderId} points at a missing deal.`];

  await store.appendEvent({
    dealId: deal.id,
    kind: "dispute_opened",
    actor: "paypal",
    summary: `PayPal dispute ${disputeId} opened${str(resource.reason) ? ` (${String(resource.reason)})` : ""}.`,
    data: { disputeId, reason: resource.reason ?? null, captureId: tx.seller_transaction_id ?? null, paypalTime: event.create_time },
    at: new Date().toISOString(),
  });
  if (deal.state === "DELIVERED") {
    await store.transition(deal.id, "ISSUE", "system", "Issue raised: a PayPal dispute is open.");
    return [true, deal.id, `Dispute ${disputeId} recorded; deal moved to ISSUE.`];
  }
  return [true, deal.id, `Dispute ${disputeId} recorded; deal is ${deal.state}, only DELIVERED can move to ISSUE.`];
}

export async function handleWebhookEvent(event: WebhookEvent, store: WebhookStore): Promise<WebhookOutcome> {
  const base = { eventId: event.id, eventType: event.event_type };
  if (await store.hasWebhookReceipt(event.id)) {
    return { ...base, handled: false, duplicate: true, dealId: null, note: "Already handled." };
  }

  let result: [boolean, string | null, string];
  switch (event.event_type) {
    case "CHECKOUT.ORDER.APPROVED":
      result = await onOrderApproved(event.resource, store);
      break;
    case "PAYMENT.CAPTURE.COMPLETED":
      result = await onCaptureCompleted(event.resource, event, store);
      break;
    case "CUSTOMER.DISPUTE.CREATED":
      result = await onDisputeCreated(event.resource, event, store);
      break;
    default:
      result = [false, null, `Event type ${event.event_type} is not handled.`];
  }

  await store.recordWebhookReceipt(event.id, event.event_type);
  const [handled, dealId, note] = result;
  return { ...base, handled, duplicate: false, dealId, note };
}
