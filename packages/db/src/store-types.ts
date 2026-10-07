/**
 * The full store both implementations return: the DealStore from contracts
 * plus webhook receipts for idempotent PayPal event handling.
 */
import type { DealStore } from "@pay-pals/contracts";
import type { WebhookReceiptStore } from "./webhook-receipts";

export type PayPalsStore = DealStore & WebhookReceiptStore;
