/**
 * Public surface of packages/paypal. Sandbox only.
 *
 *   const gateway = createPayPalGateway(loadPayPalConfig());
 *   const { orderId, approveUrl } = await gateway.createDealOrder(lockedCard, dealId);
 *   const capture = await gateway.captureOrder(orderId);
 *   const ok = await gateway.verifyWebhook(headers, rawBody);
 *   const outcome = await handleWebhookEvent(event, store);
 */
export { loadPayPalConfig, hasSandboxCredentials, PayPalConfigError, SANDBOX_BASE_URL } from "./config";
export type { PayPalConfig } from "./config";
export { createPayPalGateway, readCaptureResult } from "./gateway";
export type { PayPalsGateway, GatewayDeps, CreateOrderWithRaw, CaptureWithRaw } from "./gateway";
export { buildOrderBody, describeCard, trimTo, CardNotLockedError } from "./order-body";
export type { OrderBody, OrderItem } from "./order-body";
export { handleWebhookEvent } from "./webhook-handler";
export type { WebhookOutcome, WebhookStore } from "./webhook-handler";
export { PayPalApiError } from "./http-error";
export type { PayPalErrorBody, FetchLike } from "./http-error";
export { createTokenProvider } from "./token";
export type { TokenProvider } from "./token";
export { loadEnvLocal, ENV_LOCAL_PATH } from "./load-env";
