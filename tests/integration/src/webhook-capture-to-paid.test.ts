/**
 * PayPal webhooks drive the store. A capture on a PAYMENT_PENDING deal
 * marks the payment CAPTURED and the deal PAID, exactly once per PayPal event
 * id. A dispute on a DELIVERED deal opens an ISSUE.
 */
import { describe, expect, it } from "vitest";
import { canTransition, cleanPs5, emptyBox } from "@pay-pals/contracts";
import type { DealState, PaymentRecord, ScenarioFixture, WebhookEvent } from "@pay-pals/contracts";
import { handleWebhookEvent } from "@pay-pals/paypal";
import { driveTo, seedFixture } from "./seed";
import type { SeededDeal } from "./seed";

const ORDER_ID = "5O190127TN364715T";
const CAPTURE_ID = "3C679366HH908993F";

function paypalEvent(id: string, event_type: string, resource_type: string, resource: Record<string, unknown>): WebhookEvent {
  return { id, event_type, resource_type, resource, create_time: "2026-10-21T16:05:00Z" };
}

/** Shaped like the PAYMENT.CAPTURE.COMPLETED body PayPal posts: the resource is the capture. */
function captureCompleted(dealId: string, amount: string, eventId = "WH-2WR32451HC0233532-67976317FL4543714"): WebhookEvent {
  return paypalEvent(eventId, "PAYMENT.CAPTURE.COMPLETED", "capture", {
    id: CAPTURE_ID,
    status: "COMPLETED",
    amount: { currency_code: "USD", value: amount },
    final_capture: true,
    seller_protection: { status: "ELIGIBLE", dispute_categories: ["ITEM_NOT_RECEIVED", "UNAUTHORIZED_TRANSACTION"] },
    seller_receivable_breakdown: {
      gross_amount: { currency_code: "USD", value: amount },
      paypal_fee: { currency_code: "USD", value: "0.00" },
      net_amount: { currency_code: "USD", value: amount },
    },
    custom_id: dealId,
    invoice_id: dealId,
    supplementary_data: { related_ids: { order_id: ORDER_ID } },
    create_time: "2026-10-21T16:05:00Z",
    update_time: "2026-10-21T16:05:00Z",
    links: [{ href: `https://api-m.sandbox.paypal.com/v2/payments/captures/${CAPTURE_ID}`, rel: "self", method: "GET" }],
  });
}

/** Shaped like CUSTOMER.DISPUTE.CREATED: the resource is the dispute, with the capture under disputed_transactions. */
function disputeCreated(dealId: string, eventId = "WH-4M0448861R1427938-6U1176466Y0890030"): WebhookEvent {
  return paypalEvent(eventId, "CUSTOMER.DISPUTE.CREATED", "dispute", {
    dispute_id: "PP-D-27803",
    reason: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED",
    status: "OPEN",
    dispute_amount: { currency_code: "USD", value: "410.00" },
    disputed_transactions: [{ seller_transaction_id: CAPTURE_ID, custom: dealId, invoice_number: dealId, seller: { email: emptyBox.seller.email } }],
    create_time: "2026-10-27T15:20:00Z",
  });
}

/** Deal at `state` with a CREATED payment row for ORDER_ID, as apps/web saves it when the order is created. */
async function dealWithPayment(fixture: ScenarioFixture, state: DealState): Promise<{ seeded: SeededDeal; payment: PaymentRecord }> {
  const seeded = await seedFixture(fixture);
  await driveTo(seeded, "AGREED");
  const card = (await seeded.store.getCurrentCard(seeded.dealId))!;
  await seeded.store.lockCard(seeded.dealId, card.version);
  for (const next of ["PAYMENT_PENDING", "PAID", "SHIPPED", "DELIVERED"] as const) {
    if ((await seeded.store.getDeal(seeded.dealId))!.state === state) break;
    await seeded.store.transition(seeded.dealId, next, "system", `${next}.`);
  }
  const payment: PaymentRecord = {
    ...seeded.payment!,
    paypalOrderId: ORDER_ID,
    captureId: null,
    status: "CREATED",
    capturedAt: null,
  };
  await seeded.store.savePayment(payment);
  return { seeded, payment };
}

describe("PAYMENT.CAPTURE.COMPLETED on a PAYMENT_PENDING deal", () => {
  it("marks the payment CAPTURED and moves the deal to PAID", async () => {
    const { seeded, payment } = await dealWithPayment(cleanPs5, "PAYMENT_PENDING");
    const { store, dealId } = seeded;

    const outcome = await handleWebhookEvent(captureCompleted(dealId, "420.00"), store);
    expect(outcome).toMatchObject({ handled: true, duplicate: false, retry: false, dealId });

    const saved = (await store.getPayment(dealId))!;
    expect(saved.status).toBe("CAPTURED");
    expect(saved.captureId).toBe(CAPTURE_ID);
    expect(saved.capturedAt).toBe("2026-10-21T16:05:00Z");
    expect(saved.paypalOrderId).toBe(payment.paypalOrderId);
    expect(saved.payeeEmail).toBe(cleanPs5.cards[1]!.sellerPaypalEmail);
    expect((await store.getDeal(dealId))!.state).toBe("PAID");

    const events = await store.listEvents(dealId);
    const captured = events.filter((e) => e.kind === "payment_captured");
    expect(captured).toHaveLength(1);
    expect(captured[0]!.actor).toBe("paypal");
    expect(captured[0]!.summary).toContain("$420.00");
    expect(events.at(-1)).toMatchObject({ kind: "state_changed", fromState: "PAYMENT_PENDING", toState: "PAID" });
  });

  it("reports a redelivery of the same event id as duplicate and writes nothing twice", async () => {
    const { seeded } = await dealWithPayment(cleanPs5, "PAYMENT_PENDING");
    const { store, dealId } = seeded;
    const event = captureCompleted(dealId, "420.00");

    await handleWebhookEvent(event, store);
    const eventsAfterFirst = await store.listEvents(dealId);
    const paymentAfterFirst = await store.getPayment(dealId);

    const second = await handleWebhookEvent(event, store);
    expect(second).toMatchObject({ handled: false, duplicate: true, retry: false, eventId: event.id });
    expect(await store.listEvents(dealId)).toEqual(eventsAfterFirst);
    expect(await store.getPayment(dealId)).toEqual(paymentAfterFirst);
    expect((await store.getDeal(dealId))!.state).toBe("PAID");
    expect(await store.hasWebhookReceipt(event.id)).toBe(true);
  });

  it("asks PayPal to retry when the payment row is not saved yet, and succeeds on redelivery", async () => {
    const seeded = await seedFixture(cleanPs5);
    await driveTo(seeded, "PAYMENT_PENDING");
    const { store, dealId } = seeded;
    const event = captureCompleted(dealId, "420.00");

    const early = await handleWebhookEvent(event, store);
    expect(early).toMatchObject({ handled: false, duplicate: false, retry: true });
    expect(await store.hasWebhookReceipt(event.id)).toBe(false);
    expect((await store.getDeal(dealId))!.state).toBe("PAYMENT_PENDING");

    await store.savePayment({ ...seeded.payment!, paypalOrderId: ORDER_ID, captureId: null, status: "CREATED", capturedAt: null });
    const later = await handleWebhookEvent(event, store);
    expect(later).toMatchObject({ handled: true, duplicate: false, retry: false });
    expect((await store.getDeal(dealId))!.state).toBe("PAID");
  });
});

describe("CUSTOMER.DISPUTE.CREATED", () => {
  it("moves a DELIVERED deal to ISSUE and marks the payment DISPUTED", async () => {
    const { seeded } = await dealWithPayment(emptyBox, "DELIVERED");
    const { store, dealId } = seeded;
    await store.savePayment({ ...(await store.getPayment(dealId))!, status: "CAPTURED", captureId: CAPTURE_ID, capturedAt: "2026-10-22T15:55:00Z" });

    const outcome = await handleWebhookEvent(disputeCreated(dealId), store);
    expect(outcome).toMatchObject({ handled: true, duplicate: false, retry: false, dealId });
    expect((await store.getDeal(dealId))!.state).toBe("ISSUE");
    expect((await store.getPayment(dealId))!.status).toBe("DISPUTED");

    const events = await store.listEvents(dealId);
    const opened = events.filter((e) => e.kind === "dispute_opened");
    expect(opened).toHaveLength(1);
    expect(opened[0]!.summary).toContain("PP-D-27803");
    expect(events.at(-1)).toMatchObject({ kind: "state_changed", fromState: "DELIVERED", toState: "ISSUE" });
  });

  it("is reported duplicate on redelivery with no second dispute event", async () => {
    const { seeded } = await dealWithPayment(emptyBox, "DELIVERED");
    const { store, dealId } = seeded;
    const event = disputeCreated(dealId);

    await handleWebhookEvent(event, store);
    const second = await handleWebhookEvent(event, store);
    expect(second).toMatchObject({ handled: false, duplicate: true });
    expect((await store.listEvents(dealId)).filter((e) => e.kind === "dispute_opened")).toHaveLength(1);
  });

  // Contracts v1.2.0: a dispute before delivery (item never arrived) is an issue too.
  for (const from of ["PAID", "SHIPPED"] as const) {
    it(`moves a ${from} deal to ISSUE`, async () => {
      const { seeded } = await dealWithPayment(emptyBox, from);
      const { store, dealId } = seeded;
      expect(canTransition(from, "ISSUE")).toBe(true);

      const outcome = await handleWebhookEvent(disputeCreated(dealId), store);
      expect(outcome).toMatchObject({ handled: true, duplicate: false, retry: false, dealId });
      expect((await store.getDeal(dealId))!.state).toBe("ISSUE");
      expect((await store.getPayment(dealId))!.status).toBe("DISPUTED");
      expect((await store.listEvents(dealId)).at(-1)).toMatchObject({ kind: "state_changed", fromState: from, toState: "ISSUE" });
    });
  }
});
