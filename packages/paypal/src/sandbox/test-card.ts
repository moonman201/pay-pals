/**
 * Sandbox-only helper: approve an existing order with a PayPal test card so a
 * script or test can capture without a person clicking through the wallet.
 * Works only when the sandbox app has card processing enabled; otherwise
 * PayPal answers with an error and the caller falls back to the approve link.
 */
import type { PayPalHttp, Json } from "../http";

export interface TestCard {
  number: string;
  /** YYYY-MM */
  expiry: string;
  securityCode: string;
  name: string;
}

/** PayPal's generic sandbox Visa. Override with SANDBOX_TEST_CARD_NUMBER if your app needs a generated card. */
export function defaultTestCard(env: Record<string, string | undefined> = process.env): TestCard {
  return {
    number: env.SANDBOX_TEST_CARD_NUMBER ?? "4111111111111111",
    expiry: env.SANDBOX_TEST_CARD_EXPIRY ?? "2030-12",
    securityCode: env.SANDBOX_TEST_CARD_CVV ?? "123",
    name: "Sandbox Buyer",
  };
}

export async function confirmOrderWithTestCard(http: PayPalHttp, orderId: string, card: TestCard = defaultTestCard()): Promise<Json> {
  return http.request(
    "POST",
    `/v2/checkout/orders/${encodeURIComponent(orderId)}/confirm-payment-source`,
    {
      payment_source: {
        card: {
          number: card.number,
          expiry: card.expiry,
          security_code: card.securityCode,
          name: card.name,
          billing_address: {
            address_line_1: "1 Main St",
            admin_area_2: "San Jose",
            admin_area_1: "CA",
            postal_code: "95131",
            country_code: "US",
          },
        },
      },
    },
    { "PayPal-Request-Id": crypto.randomUUID() },
  );
}
