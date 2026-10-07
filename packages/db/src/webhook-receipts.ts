/**
 * Idempotency for PayPal webhooks. One receipt per PayPal event id.
 * packages/paypal declares the same two-method shape and accepts any object
 * that satisfies it, so neither package imports the other.
 */
export interface WebhookReceiptStore {
  hasWebhookReceipt(eventId: string): Promise<boolean>;
  /** Returns false when the receipt already existed. */
  recordWebhookReceipt(eventId: string, eventType: string): Promise<boolean>;
}
