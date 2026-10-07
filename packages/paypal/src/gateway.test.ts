import { describe, expect, it } from "vitest";
import { getFixture } from "@pay-pals/contracts";
import type { WebhookHeaders } from "@pay-pals/contracts";
import { loadPayPalConfig, PayPalConfigError, SANDBOX_BASE_URL } from "./config";
import { createPayPalGateway } from "./gateway";
import { PayPalApiError } from "./http-error";
import { TOKEN_OK, mockFetch } from "./test-support/mock-fetch";

const fx = getFixture("clean-garmin");
const locked = fx.cards[1]!;
const dealId = fx.deal.id;
const config = loadPayPalConfig({ PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "secret", PAYPAL_WEBHOOK_ID: "WH-1" });

const createdOrder = {
  id: "5O190127TN364715T",
  status: "CREATED",
  links: [
    { href: `${SANDBOX_BASE_URL}/v2/checkout/orders/5O190127TN364715T`, rel: "self", method: "GET" },
    { href: "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T", rel: "approve", method: "GET" },
  ],
};

const capturedOrder = {
  id: "5O190127TN364715T",
  status: "COMPLETED",
  purchase_units: [
    {
      payee: { email_address: locked.sellerPaypalEmail, merchant_id: "ABC123" },
      payments: { captures: [{ id: "3C679366HH908993F", status: "COMPLETED", amount: { currency_code: "USD", value: "475.00" } }] },
    },
  ],
};

const webhookHeaders: WebhookHeaders = {
  "paypal-transmission-id": "tid",
  "paypal-transmission-time": "2026-10-21T17:05:00Z",
  "paypal-transmission-sig": "sig",
  "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1",
  "paypal-auth-algo": "SHA256withRSA",
};

describe("createPayPalGateway", () => {
  it("creates the order with a bearer token, a deterministic request id and the card body", async () => {
    const f = mockFetch().reply(200, TOKEN_OK).reply(201, createdOrder);
    const gw = createPayPalGateway(config, { fetch: f.fetch });
    const result = await gw.createDealOrder(locked, dealId);
    expect(result).toEqual({
      orderId: "5O190127TN364715T",
      status: "CREATED",
      approveUrl: "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T",
      raw: createdOrder,
    });
    const call = f.calls[1]!;
    expect(call.url).toBe(`${SANDBOX_BASE_URL}/v2/checkout/orders`);
    expect(call.headers.authorization).toBe("Bearer test-token");
    // Same deal and card version means the same id, so a retry cannot create a second order.
    expect(call.headers["paypal-request-id"]).toBe(`pp-create-${dealId}-v${locked.version}`);
    const body = call.body as { purchase_units: Array<Record<string, unknown>> };
    expect(body.purchase_units[0]!.payee).toEqual({ email_address: locked.sellerPaypalEmail });
    expect(body.purchase_units[0]!.custom_id).toBe(dealId);
  });

  it("will not create an order for an unlocked card and makes no network call", async () => {
    const f = mockFetch();
    const gw = createPayPalGateway(config, { fetch: f.fetch });
    await expect(gw.createDealOrder(fx.cards[0]!, dealId)).rejects.toThrow(/not locked/);
    expect(f.calls).toHaveLength(0);
  });

  it("reuses the token across calls", async () => {
    const f = mockFetch().reply(200, TOKEN_OK).reply(201, createdOrder).reply(200, createdOrder);
    const gw = createPayPalGateway(config, { fetch: f.fetch });
    await gw.createDealOrder(locked, dealId);
    await gw.getOrder("5O190127TN364715T");
    expect(f.calls.filter((c) => c.url.endsWith("/v1/oauth2/token"))).toHaveLength(1);
    expect(f.calls[2]!.method).toBe("GET");
  });

  it("retries once with a fresh token on 401", async () => {
    const f = mockFetch()
      .reply(200, TOKEN_OK)
      .reply(401, { name: "UNAUTHORIZED" })
      .reply(200, { ...TOKEN_OK, access_token: "fresh" })
      .reply(200, createdOrder);
    const gw = createPayPalGateway(config, { fetch: f.fetch });
    await gw.getOrder("5O190127TN364715T");
    expect(f.calls[3]!.headers.authorization).toBe("Bearer fresh");
  });

  it("captures and reports capture id, status, payee and amount", async () => {
    const f = mockFetch().reply(200, TOKEN_OK).reply(201, capturedOrder);
    const gw = createPayPalGateway(config, { fetch: f.fetch });
    const result = await gw.captureOrder("5O190127TN364715T");
    expect(result).toEqual({
      orderId: "5O190127TN364715T",
      captureId: "3C679366HH908993F",
      status: "COMPLETED",
      payeeEmail: locked.sellerPaypalEmail,
      amount: "475.00",
      currency: "USD",
      raw: capturedOrder,
    });
    expect(f.calls[1]!.url).toBe(`${SANDBOX_BASE_URL}/v2/checkout/orders/5O190127TN364715T/capture`);
    expect(f.calls[1]!.method).toBe("POST");
    expect(f.calls[1]!.headers["paypal-request-id"]).toBe("pp-capture-5O190127TN364715T");
  });

  it("throws PayPalApiError with the PayPal body on failure", async () => {
    const body = {
      name: "UNPROCESSABLE_ENTITY",
      message: "The requested action could not be performed.",
      debug_id: "d1",
      details: [{ issue: "PAYEE_ACCOUNT_INVALID", description: "Payee account is invalid." }],
    };
    const f = mockFetch().reply(200, TOKEN_OK).reply(422, body);
    const gw = createPayPalGateway(config, { fetch: f.fetch });
    const err = await gw.createDealOrder(locked, dealId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PayPalApiError);
    const e = err as PayPalApiError;
    expect(e.status).toBe(422);
    expect(e.details?.[0]?.issue).toBe("PAYEE_ACCOUNT_INVALID");
    expect(e.message).toContain("PAYEE_ACCOUNT_INVALID");
  });

  it("verifies a webhook with the raw body and the configured webhook id", async () => {
    const f = mockFetch().reply(200, TOKEN_OK).reply(200, { verification_status: "SUCCESS" }).reply(200, { verification_status: "FAILURE" });
    const gw = createPayPalGateway(config, { fetch: f.fetch });
    // A float with a trailing zero would change under parse-and-stringify. It must reach PayPal as sent.
    const raw = '{"id":"WH-EVT-1","event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"amount":{"value":475.0}}}';
    expect(await gw.verifyWebhook(webhookHeaders, raw)).toBe(true);
    expect(f.calls[1]!.body).toEqual({
      auth_algo: "SHA256withRSA",
      cert_url: webhookHeaders["paypal-cert-url"],
      transmission_id: "tid",
      transmission_sig: "sig",
      transmission_time: "2026-10-21T17:05:00Z",
      webhook_id: "WH-1",
      webhook_event: JSON.parse(raw),
    });
    expect(f.calls[1]!.rawBody).toContain(`"webhook_event":${raw}}`);
    expect(await gw.verifyWebhook(webhookHeaders, raw)).toBe(false);
    expect(await gw.verifyWebhook(webhookHeaders, "not json")).toBe(false);
  });

  it("refuses to verify without a webhook id", async () => {
    const f = mockFetch();
    const gw = createPayPalGateway({ ...config, webhookId: null }, { fetch: f.fetch });
    await expect(gw.verifyWebhook(webhookHeaders, "{}")).rejects.toBeInstanceOf(PayPalConfigError);
  });
});
