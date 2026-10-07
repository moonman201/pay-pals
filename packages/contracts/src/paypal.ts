/**
 * Interface packages/paypal implements. Sandbox only.
 * The locked card is the order: payee is the seller, the line item carries
 * title, serial and condition, custom_id is the deal id.
 */
import type { ItemCard } from "./item-card";

export const PAYPAL_ORDER_STATUSES = [
  "CREATED",
  "SAVED",
  "APPROVED",
  "VOIDED",
  "COMPLETED",
  "PAYER_ACTION_REQUIRED",
] as const;
export type PayPalOrderStatus = (typeof PAYPAL_ORDER_STATUSES)[number];

export const PAYPAL_CAPTURE_STATUSES = ["COMPLETED", "DECLINED", "PARTIALLY_REFUNDED", "PENDING", "REFUNDED", "FAILED"] as const;
export type PayPalCaptureStatus = (typeof PAYPAL_CAPTURE_STATUSES)[number];

/** Orders v2 field length limits we must respect when writing card text into an order. */
export const PAYPAL_LIMITS = {
  itemName: 127,
  itemDescription: 127,
  itemSku: 127,
  customId: 127,
  invoiceId: 127,
  purchaseUnitDescription: 127,
  softDescriptor: 22,
} as const;

export const PAYPAL_WEBHOOK_EVENTS = [
  "CHECKOUT.ORDER.APPROVED",
  "PAYMENT.CAPTURE.COMPLETED",
  "CUSTOMER.DISPUTE.CREATED",
] as const;
export type PayPalWebhookEvent = (typeof PAYPAL_WEBHOOK_EVENTS)[number];

export interface CreateOrderResult {
  orderId: string;
  status: PayPalOrderStatus;
  /** The payer approval link, when PayPal returns one. The JS SDK flow does not need it. */
  approveUrl: string | null;
}

export interface CaptureResult {
  orderId: string;
  captureId: string;
  status: PayPalCaptureStatus;
  /** Who got paid, as PayPal reports it. Used to prove the payee was the seller. */
  payeeEmail: string | null;
  amount: string;
  currency: string;
}

/** Headers PayPal sends with every webhook. Names are lower-cased. */
export interface WebhookHeaders {
  "paypal-transmission-id": string;
  "paypal-transmission-time": string;
  "paypal-transmission-sig": string;
  "paypal-cert-url": string;
  "paypal-auth-algo": string;
}

export interface WebhookEvent {
  id: string;
  event_type: PayPalWebhookEvent | string;
  resource_type: string;
  resource: Record<string, unknown>;
  create_time: string;
}

export interface CreateOrderOptions {
  /** Head of the deal's event hash chain. Written into custom_id so PayPal's record proves the history. */
  historyHash?: string | null;
}

/** custom_id carries the deal id and, after a "#", the history hash. invoice_id stays the bare deal id. */
export const CUSTOM_ID_SEPARATOR = "#";

export function buildCustomId(dealId: string, historyHash?: string | null): string {
  return historyHash ? `${dealId}${CUSTOM_ID_SEPARATOR}${historyHash}` : dealId;
}

export function parseCustomId(customId: string): { dealId: string; historyHash: string | null } {
  const i = customId.indexOf(CUSTOM_ID_SEPARATOR);
  if (i === -1) return { dealId: customId, historyHash: null };
  return { dealId: customId.slice(0, i), historyHash: customId.slice(i + 1) || null };
}

export interface PayPalGateway {
  /** Create a Goods and Services checkout order for the locked card. Throws if the card is not locked. */
  createDealOrder(lockedCard: ItemCard, dealId: string, options?: CreateOrderOptions): Promise<CreateOrderResult>;
  captureOrder(orderId: string): Promise<CaptureResult>;
  /** Verify a webhook signature with PayPal. rawBody must be the exact bytes received. */
  verifyWebhook(headers: WebhookHeaders, rawBody: string): Promise<boolean>;
}
