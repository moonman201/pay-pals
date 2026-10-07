/**
 * PayPalGateway implementation: create the order for a locked card, capture
 * it, verify a webhook signature. Also exposes getOrder so callers can show
 * the order as PayPal holds it.
 */
import type {
  CaptureResult,
  CreateOrderOptions,
  CreateOrderResult,
  ItemCard,
  PayPalCaptureStatus,
  PayPalGateway,
  PayPalOrderStatus,
  WebhookHeaders,
} from "@pay-pals/contracts";
import type { PayPalConfig } from "./config";
import { PayPalConfigError } from "./config";
import type { FetchLike } from "./http-error";
import { createPayPalHttp, type Json, type PayPalHttp } from "./http";
import { buildOrderBody } from "./order-body";
import { createTokenProvider, type TokenProvider } from "./token";

export interface GatewayDeps {
  fetch?: FetchLike;
  now?: () => number;
  /** For scripts that already hold a token provider. */
  tokens?: TokenProvider;
}

/**
 * PayPal-Request-Id values. Deterministic per deal and card version so a
 * retried create returns the same order instead of making a second one.
 */
export const requestIds = {
  create: (dealId: string, cardVersion: number) => `pp-create-${dealId}-v${cardVersion}`,
  capture: (orderId: string) => `pp-capture-${orderId}`,
};

/** Contract results plus PayPal's own response body, kept on the payment record for the evidence pack. */
export type CreateOrderWithRaw = CreateOrderResult & { raw: Json };
export type CaptureWithRaw = CaptureResult & { raw: Json };

export interface PayPalsGateway extends PayPalGateway {
  createDealOrder(lockedCard: ItemCard, dealId: string, options?: CreateOrderOptions): Promise<CreateOrderWithRaw>;
  captureOrder(orderId: string): Promise<CaptureWithRaw>;
  getOrder(orderId: string): Promise<Json>;
  /** Low-level access for the gate script and sandbox tests. */
  http: PayPalHttp;
}

type Link = { rel?: string; href?: string };

function findLink(order: Json, rels: string[]): string | null {
  const links = (order.links as Link[] | undefined) ?? [];
  for (const rel of rels) {
    const hit = links.find((l) => l.rel === rel && typeof l.href === "string");
    if (hit?.href) return hit.href;
  }
  return null;
}

function firstPurchaseUnit(order: Json): Json {
  const units = order.purchase_units as Json[] | undefined;
  return units?.[0] ?? {};
}

/** Pulls the capture result out of a capture response (or a GET order after capture). */
export function readCaptureResult(order: Json): CaptureResult {
  const unit = firstPurchaseUnit(order);
  const captures = ((unit.payments as Json | undefined)?.captures as Json[] | undefined) ?? [];
  const capture = captures[0];
  if (!capture) throw new Error(`Order ${String(order.id)} has no capture in its response`);
  const amount = (capture.amount as { value?: string; currency_code?: string } | undefined) ?? {};
  const payee = (unit.payee as { email_address?: string } | undefined) ?? {};
  return {
    orderId: String(order.id),
    captureId: String(capture.id),
    status: capture.status as PayPalCaptureStatus,
    payeeEmail: payee.email_address ?? null,
    amount: amount.value ?? "",
    currency: amount.currency_code ?? "",
  };
}

export function createPayPalGateway(config: PayPalConfig, deps: GatewayDeps = {}): PayPalsGateway {
  if (config.env !== "sandbox") throw new PayPalConfigError("Only the PayPal sandbox is supported.");
  const tokens = deps.tokens ?? createTokenProvider(config, { fetch: deps.fetch, now: deps.now });
  const http = createPayPalHttp(config, tokens, deps.fetch);

  return {
    http,

    async createDealOrder(lockedCard: ItemCard, dealId: string, options: CreateOrderOptions = {}): Promise<CreateOrderWithRaw> {
      const body = buildOrderBody(lockedCard, dealId, options.historyHash);
      const order = await http.request("POST", "/v2/checkout/orders", body, {
        "PayPal-Request-Id": requestIds.create(dealId, lockedCard.version),
        Prefer: "return=representation",
      });
      return {
        orderId: String(order.id),
        status: order.status as PayPalOrderStatus,
        approveUrl: findLink(order, ["approve", "payer-action"]),
        raw: order,
      };
    },

    async captureOrder(orderId: string): Promise<CaptureWithRaw> {
      const order = await http.request("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {}, {
        "PayPal-Request-Id": requestIds.capture(orderId),
        Prefer: "return=representation",
      });
      return { ...readCaptureResult(order), raw: order };
    },

    async getOrder(orderId: string): Promise<Json> {
      return http.request("GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
    },

    async verifyWebhook(headers: WebhookHeaders, rawBody: string): Promise<boolean> {
      if (!config.webhookId) throw new PayPalConfigError("PAYPAL_WEBHOOK_ID is required to verify webhooks.");
      try {
        JSON.parse(rawBody);
      } catch {
        return false;
      }
      // The signed bytes must reach PayPal unchanged, so the raw body is
      // spliced into the request as text rather than parsed and re-serialized.
      const fields = JSON.stringify({
        auth_algo: headers["paypal-auth-algo"],
        cert_url: headers["paypal-cert-url"],
        transmission_id: headers["paypal-transmission-id"],
        transmission_sig: headers["paypal-transmission-sig"],
        transmission_time: headers["paypal-transmission-time"],
        webhook_id: config.webhookId,
      });
      const raw = `${fields.slice(0, -1)},"webhook_event":${rawBody}}`;
      const result = await http.requestRaw("POST", "/v1/notifications/verify-webhook-signature", raw);
      return result.verification_status === "SUCCESS";
    },
  };
}
