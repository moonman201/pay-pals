/**
 * Real sandbox test. Skips itself when PAYPAL_CLIENT_ID is unset so the
 * suite is green with no keys. With keys it creates a real order paid to the
 * seller payee and checks the card text on GET /v2/checkout/orders/{id}.
 * Capture runs only when the sandbox app accepts a test card; the wallet
 * approval path needs a person and lives in scripts/lane0-gate.ts.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { CONDITION_LABELS, buildCustomId, getFixture, toPaypalAmount } from "@pay-pals/contracts";
import { hasSandboxCredentials, loadPayPalConfig } from "./config";
import { createPayPalGateway, type PayPalsGateway } from "./gateway";
import { PayPalApiError } from "./http-error";
import { confirmOrderWithTestCard } from "./sandbox/test-card";
import { buildDemoHistory, type DemoHistory } from "./test-support/demo-history";

const payee = process.env.SANDBOX_SELLER_BUSINESS_EMAIL || process.env.SANDBOX_SELLER_PERSONAL_EMAIL;
/** SKIP_REAL_TESTS=1 turns this off even when credentials are present. The merge gate runs with it set. */
const enabled = !process.env.SKIP_REAL_TESTS && hasSandboxCredentials() && Boolean(payee);

describe.skipIf(!enabled)("PayPal sandbox (real calls)", () => {
  const fx = getFixture("clean-ps5");
  let history: DemoHistory;
  let gateway: PayPalsGateway;
  let orderId = "";

  beforeAll(async () => {
    gateway = createPayPalGateway(loadPayPalConfig());
    // A real chain head from a real (in-memory) history, so the order carries it.
    history = await buildDemoHistory({ ...fx.cards[1]!, sellerPaypalEmail: payee! }, fx.seller, fx.buyer);
  });

  it("creates an order paid to the seller with the card text and the history head on it", async () => {
    const { card, dealId, historyHash } = history;
    const created = await gateway.createDealOrder(card, dealId, { historyHash });
    orderId = created.orderId;
    expect(created.status).toBe("CREATED");
    expect(created.approveUrl).toMatch(/^https:\/\/www\.sandbox\.paypal\.com\//);

    const order = await gateway.getOrder(orderId);
    const unit = (order.purchase_units as Array<Record<string, unknown>>)[0]!;
    expect((unit.payee as { email_address: string }).email_address).toBe(payee);
    expect(unit.custom_id).toBe(buildCustomId(dealId, historyHash));
    expect(unit.invoice_id).toBe(dealId);
    const item = (unit.items as Array<Record<string, string>>)[0]!;
    expect(item.name).toBe(card.title);
    expect(item.description).toContain(`Serial ${card.serial}`);
    expect(item.description).toContain(`Condition: ${CONDITION_LABELS[card.conditionGrade]}`);
  }, 30_000);

  it("captures the order to the seller when a sandbox test card is accepted", async (ctx) => {
    expect(orderId).not.toBe("");
    try {
      await confirmOrderWithTestCard(gateway.http, orderId);
    } catch (err) {
      if (err instanceof PayPalApiError) {
        ctx.skip(`Sandbox app does not accept a test card here (${err.message}). Run npm run gate -w packages/paypal to approve as the sandbox buyer.`);
        return;
      }
      throw err;
    }
    const capture = await gateway.captureOrder(orderId);
    expect(capture.status).toBe("COMPLETED");
    expect(capture.payeeEmail).toBe(payee);
    expect(capture.amount).toBe(toPaypalAmount(history.card.askingPrice));
    const order = await gateway.getOrder(orderId);
    expect(order.status).toBe("COMPLETED");
  }, 60_000);
});
