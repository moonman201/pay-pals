import { beforeEach, describe, expect, it } from "vitest";
import { getFixture } from "@pay-pals/contracts";
import type { Deal, PaymentRecord, WebhookEvent } from "@pay-pals/contracts";
import { createMemoryDealStore } from "@pay-pals/db";
import type { PayPalsStore } from "@pay-pals/db";
import { handleWebhookEvent } from "./webhook-handler";

const fx = getFixture("clean-ps5");
const ORDER_ID = "5O190127TN364715T";
const CAPTURE_ID = "3C679366HH908993F";

function event(type: string, resource: Record<string, unknown>, id = `WH-${crypto.randomUUID()}`): WebhookEvent {
  return { id, event_type: type, resource_type: "x", resource, create_time: "2026-01-05T17:05:00Z" };
}

const approved = (dealId: string) => event("CHECKOUT.ORDER.APPROVED", { id: ORDER_ID, status: "APPROVED", purchase_units: [{ custom_id: dealId }] });
const captured = (dealId: string) =>
  event("PAYMENT.CAPTURE.COMPLETED", {
    id: CAPTURE_ID,
    status: "COMPLETED",
    custom_id: dealId,
    invoice_id: dealId,
    amount: { currency_code: "USD", value: "475.00" },
    create_time: "2026-01-05T17:05:00Z",
    supplementary_data: { related_ids: { order_id: ORDER_ID } },
  });
const disputed = (dealId: string) =>
  event("CUSTOMER.DISPUTE.CREATED", {
    dispute_id: "PP-D-12345",
    reason: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED",
    disputed_transactions: [{ seller_transaction_id: CAPTURE_ID, custom: dealId, invoice_number: dealId }],
  });

async function dealAt(store: PayPalsStore, state: Deal["state"]): Promise<{ deal: Deal; payment: PaymentRecord }> {
  const deal = await store.createDeal({ seller: fx.seller, buyer: fx.buyer });
  const path: Deal["state"][] = ["LISTED", "REVIEWED", "AGREED", "PAYMENT_PENDING", "PAID", "SHIPPED", "DELIVERED", "COMPLETE"];
  for (const s of path) {
    if (deal.state === state) break;
    await store.transition(deal.id, s, "system", s);
    if (s === state) break;
  }
  const payment: PaymentRecord = {
    dealId: deal.id,
    paypalOrderId: ORDER_ID,
    captureId: null,
    status: "CREATED",
    payeeEmail: fx.cards[1]!.sellerPaypalEmail,
    amount: 475,
    currency: "USD",
    method: "paypal",
    createdAt: "2026-01-05T17:02:00.000Z",
    capturedAt: null,
  };
  await store.savePayment(payment);
  return { deal: (await store.getDeal(deal.id))!, payment };
}

describe("handleWebhookEvent", () => {
  let store: PayPalsStore;
  beforeEach(() => {
    store = createMemoryDealStore();
  });

  it("marks the payment APPROVED on CHECKOUT.ORDER.APPROVED without moving the deal", async () => {
    const { deal } = await dealAt(store, "PAYMENT_PENDING");
    const out = await handleWebhookEvent(approved(deal.id), store);
    expect(out).toMatchObject({ handled: true, duplicate: false, dealId: deal.id });
    expect((await store.getPayment(deal.id))?.status).toBe("APPROVED");
    expect((await store.getDeal(deal.id))?.state).toBe("PAYMENT_PENDING");
  });

  it("moves PAYMENT_PENDING to PAID on PAYMENT.CAPTURE.COMPLETED and records the capture", async () => {
    const { deal } = await dealAt(store, "PAYMENT_PENDING");
    const out = await handleWebhookEvent(captured(deal.id), store);
    expect(out.handled).toBe(true);
    const payment = await store.getPayment(deal.id);
    expect(payment).toMatchObject({ status: "CAPTURED", captureId: CAPTURE_ID, capturedAt: "2026-01-05T17:05:00Z" });
    expect((await store.getDeal(deal.id))?.state).toBe("PAID");
    const kinds = (await store.listEvents(deal.id)).map((e) => e.kind);
    expect(kinds.slice(-2)).toEqual(["payment_captured", "state_changed"]);
  });

  it("finds the payment by order id when custom_id is missing", async () => {
    const { deal } = await dealAt(store, "PAYMENT_PENDING");
    const e = captured(deal.id);
    delete e.resource.custom_id;
    delete e.resource.invoice_id;
    expect((await handleWebhookEvent(e, store)).handled).toBe(true);
    expect((await store.getDeal(deal.id))?.state).toBe("PAID");
  });

  it("is idempotent: the same event id is handled once", async () => {
    const { deal } = await dealAt(store, "PAYMENT_PENDING");
    const e = captured(deal.id);
    await handleWebhookEvent(e, store);
    const second = await handleWebhookEvent(e, store);
    expect(second).toMatchObject({ handled: false, duplicate: true });
    expect((await store.listEvents(deal.id)).filter((x) => x.kind === "payment_captured")).toHaveLength(1);
  });

  it("does not move a deal that is already PAID when a second capture event arrives with a new id", async () => {
    const { deal } = await dealAt(store, "PAYMENT_PENDING");
    await handleWebhookEvent(captured(deal.id), store);
    const again = await handleWebhookEvent(captured(deal.id), store);
    expect(again.handled).toBe(true);
    expect(again.note).toContain("already PAID");
    expect((await store.getDeal(deal.id))?.state).toBe("PAID");
  });

  it("moves DELIVERED to ISSUE on CUSTOMER.DISPUTE.CREATED and marks the payment DISPUTED", async () => {
    const { deal } = await dealAt(store, "DELIVERED");
    const out = await handleWebhookEvent(disputed(deal.id), store);
    expect(out).toMatchObject({ handled: true, dealId: deal.id });
    expect((await store.getDeal(deal.id))?.state).toBe("ISSUE");
    expect((await store.getPayment(deal.id))?.status).toBe("DISPUTED");
    const events = await store.listEvents(deal.id);
    expect(events.some((e) => e.kind === "dispute_opened" && e.summary.includes("PP-D-12345"))).toBe(true);
  });

  for (const state of ["PAID", "SHIPPED"] as const) {
    it(`moves a ${state} deal to ISSUE on CUSTOMER.DISPUTE.CREATED`, async () => {
      const { deal } = await dealAt(store, state);
      const out = await handleWebhookEvent(disputed(deal.id), store);
      expect(out.handled).toBe(true);
      expect((await store.getDeal(deal.id))?.state).toBe("ISSUE");
      expect((await store.getPayment(deal.id))?.status).toBe("DISPUTED");
    });
  }

  it("records a dispute on a COMPLETE deal without a transition (COMPLETE is terminal)", async () => {
    const { deal } = await dealAt(store, "COMPLETE");
    const out = await handleWebhookEvent(disputed(deal.id), store);
    expect(out.handled).toBe(true);
    expect(out.note).toContain("cannot move to ISSUE");
    expect((await store.getDeal(deal.id))?.state).toBe("COMPLETE");
    expect((await store.getPayment(deal.id))?.status).toBe("DISPUTED");
    expect((await store.listEvents(deal.id)).some((e) => e.kind === "dispute_opened")).toBe(true);
  });

  it("keeps the webhook's capture resource as rawCapture when capture() did not run on our side", async () => {
    const { deal } = await dealAt(store, "PAYMENT_PENDING");
    await handleWebhookEvent(captured(deal.id), store);
    expect((await store.getPayment(deal.id))?.rawCapture).toMatchObject({ id: CAPTURE_ID, status: "COMPLETED" });
  });

  it("asks for a retry and keeps no receipt when the payment is not saved yet", async () => {
    const e = captured("00000000-0000-4000-8000-000000000000");
    const out = await handleWebhookEvent(e, store);
    expect(out).toMatchObject({ handled: false, duplicate: false, retry: true });
    expect(await store.hasWebhookReceipt(e.id)).toBe(false);
  });

  it("handles the redelivery once the payment exists", async () => {
    const { deal } = await dealAt(store, "PAYMENT_PENDING");
    const e = captured(deal.id);
    const early: PayPalsStore = { ...store, getPaymentByOrderId: async () => null, getPayment: async () => null };
    expect((await handleWebhookEvent(e, early)).retry).toBe(true);
    const later = await handleWebhookEvent(e, store);
    expect(later).toMatchObject({ handled: true, duplicate: false, retry: false });
    expect((await store.getDeal(deal.id))?.state).toBe("PAID");
  });

  it("ignores event types outside the three it handles and keeps the receipt", async () => {
    const e = event("PAYMENT.CAPTURE.REFUNDED", { id: "x" });
    const out = await handleWebhookEvent(e, store);
    expect(out).toMatchObject({ handled: false, retry: false });
    expect(out.note).toContain("not handled");
    expect(await store.hasWebhookReceipt(e.id)).toBe(true);
  });

  it("claims the event id before working, so a concurrent duplicate is rejected", async () => {
    const { deal } = await dealAt(store, "PAYMENT_PENDING");
    const e = captured(deal.id);
    const [a, b] = await Promise.all([handleWebhookEvent(e, store), handleWebhookEvent(e, store)]);
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
    expect((await store.listEvents(deal.id)).filter((x) => x.kind === "payment_captured")).toHaveLength(1);
  });

  it("releases the claim when the store fails, so PayPal's retry is processed", async () => {
    const { deal } = await dealAt(store, "PAYMENT_PENDING");
    const broken: PayPalsStore = { ...store, savePayment: async () => Promise.reject(new Error("db down")) };
    const e = captured(deal.id);
    await expect(handleWebhookEvent(e, broken)).rejects.toThrow("db down");
    expect(await store.hasWebhookReceipt(e.id)).toBe(false);
  });
});
