/**
 * Maps the three PayPal webhook events Pay Pals cares about onto store
 * updates. Idempotent: the handler claims the PayPal event id first, so two
 * deliveries of the same event cannot both run. If the work fails, or the
 * event could not be matched to a payment yet, the claim is released so
 * PayPal's redelivery is processed.
 *
 * Signature verification happens before this, in the API route, with
 * PayPalGateway.verifyWebhook.
 */
import { canTransition } from "@pay-pals/contracts";
import type { PayPalsStore, PaymentRecord, WebhookEvent } from "@pay-pals/contracts";

/** The store the handler needs: deals plus webhook receipts, as packages/db returns it. */
export type WebhookStore = PayPalsStore;

export interface WebhookOutcome {
  eventId: string;
  eventType: string;
  /** True when the event changed our records. */
  handled: boolean;
  /** True when this event id was already claimed by an earlier delivery. */
  duplicate: boolean;
  /**
   * True when the event matched nothing yet (for example the capture arrived
   * before our payment row was saved). The claim was released; answer PayPal
   * with a non-2xx status so it redelivers.
   */
  retry: boolean;
  dealId: string | null;
  /** One plain sentence for logs. */
  note: string;
}

interface Applied {
  handled: boolean;
  dealId: string | null;
  note: string;
  retry?: boolean;
}

type Res = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const money = (p: PaymentRecord) => `$${p.amount.toFixed(2)}`;
const noPayment = (what: string): Applied => ({ handled: false, dealId: null, note: `No payment found for ${what}; will retry.`, retry: true });

async function onOrderApproved(resource: Res, store: WebhookStore): Promise<Applied> {
  const orderId = str(resource.id);
  const payment = orderId ? await store.getPaymentByOrderId(orderId) : null;
  if (!payment) return noPayment(`approved order ${orderId ?? "(missing id)"}`);
  if (payment.status === "CREATED") await store.savePayment({ ...payment, status: "APPROVED" });
  return { handled: true, dealId: payment.dealId, note: `Order ${orderId} approved by the buyer.` };
}

async function onCaptureCompleted(resource: Res, event: WebhookEvent, store: WebhookStore): Promise<Applied> {
  const captureId = str(resource.id);
  const related = (resource.supplementary_data as Res | undefined)?.related_ids as Res | undefined;
  const orderId = str(related?.order_id);
  const dealIdHint = str(resource.custom_id) ?? str(resource.invoice_id);
  const payment = (orderId ? await store.getPaymentByOrderId(orderId) : null) ?? (dealIdHint ? await store.getPayment(dealIdHint) : null);
  if (!payment || !captureId) return noPayment(`capture ${captureId ?? "(missing id)"}`);

  if (payment.status !== "CAPTURED" || payment.captureId !== captureId) {
    await store.savePayment({
      ...payment,
      status: "CAPTURED",
      captureId,
      capturedAt: str(resource.create_time) ?? event.create_time,
      // The capture response from captureOrder wins; the webhook's capture resource fills the gap otherwise.
      rawCapture: payment.rawCapture ?? resource,
    });
  }

  const deal = await store.getDeal(payment.dealId);
  if (!deal) return { handled: false, dealId: payment.dealId, note: `Payment ${payment.paypalOrderId} points at a missing deal.` };
  if (deal.state !== "PAYMENT_PENDING") {
    return { handled: true, dealId: deal.id, note: `Capture ${captureId} recorded; deal already ${deal.state}, no transition.` };
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
  return { handled: true, dealId: deal.id, note: `Capture ${captureId} recorded; deal moved to PAID.` };
}

async function onDisputeCreated(resource: Res, event: WebhookEvent, store: WebhookStore): Promise<Applied> {
  const disputeId = str(resource.dispute_id) ?? str(resource.id) ?? "(unknown)";
  const tx = ((resource.disputed_transactions as Res[] | undefined) ?? [])[0] ?? {};
  const dealId = str(tx.custom) ?? str(tx.invoice_number);
  const payment = dealId ? await store.getPayment(dealId) : null;
  if (!payment) return { handled: false, dealId, note: `Dispute ${disputeId} does not match a Pay Pals deal.` };

  if (payment.status !== "DISPUTED") await store.savePayment({ ...payment, status: "DISPUTED" });
  const deal = await store.getDeal(payment.dealId);
  if (!deal) return { handled: false, dealId: payment.dealId, note: `Payment ${payment.paypalOrderId} points at a missing deal.` };

  await store.appendEvent({
    dealId: deal.id,
    kind: "dispute_opened",
    actor: "paypal",
    summary: `PayPal dispute ${disputeId} opened${str(resource.reason) ? ` (${String(resource.reason)})` : ""}.`,
    data: { disputeId, reason: resource.reason ?? null, captureId: tx.seller_transaction_id ?? null, paypalTime: event.create_time },
    at: new Date().toISOString(),
  });
  if (canTransition(deal.state, "ISSUE")) {
    await store.transition(deal.id, "ISSUE", "system", "Issue raised: a PayPal dispute is open.");
    return { handled: true, dealId: deal.id, note: `Dispute ${disputeId} recorded; deal moved to ISSUE.` };
  }
  return { handled: true, dealId: deal.id, note: `Dispute ${disputeId} recorded; deal is ${deal.state}, which cannot move to ISSUE.` };
}

async function apply(event: WebhookEvent, store: WebhookStore): Promise<Applied> {
  switch (event.event_type) {
    case "CHECKOUT.ORDER.APPROVED":
      return onOrderApproved(event.resource, store);
    case "PAYMENT.CAPTURE.COMPLETED":
      return onCaptureCompleted(event.resource, event, store);
    case "CUSTOMER.DISPUTE.CREATED":
      return onDisputeCreated(event.resource, event, store);
    default:
      return { handled: false, dealId: null, note: `Event type ${event.event_type} is not handled.` };
  }
}

export async function handleWebhookEvent(event: WebhookEvent, store: WebhookStore): Promise<WebhookOutcome> {
  const base = { eventId: event.id, eventType: event.event_type };
  const claimed = await store.recordWebhookReceipt(event.id, event.event_type);
  if (!claimed) return { ...base, handled: false, duplicate: true, retry: false, dealId: null, note: "Already handled." };

  let applied: Applied;
  try {
    applied = await apply(event, store);
  } catch (err) {
    await store.releaseWebhookReceipt(event.id);
    throw err;
  }

  const retry = !applied.handled && applied.retry === true;
  if (retry) await store.releaseWebhookReceipt(event.id);
  return { ...base, handled: applied.handled, duplicate: false, retry, dealId: applied.dealId, note: applied.note };
}
