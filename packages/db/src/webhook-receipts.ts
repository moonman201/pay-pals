/**
 * Idempotency for PayPal webhooks. One receipt per PayPal event id.
 * The handler claims the id first (record), does its work, and releases the
 * claim if the work failed so PayPal's retry is processed.
 * packages/paypal declares the same shape and accepts any object that
 * satisfies it, so neither package imports the other.
 */
export interface WebhookReceiptStore {
  hasWebhookReceipt(eventId: string): Promise<boolean>;
  /** Claims the event id. Returns false when it was already claimed. */
  recordWebhookReceipt(eventId: string, eventType: string): Promise<boolean>;
  /** Drops a claim so the event can be handled again. */
  releaseWebhookReceipt(eventId: string): Promise<void>;
}
