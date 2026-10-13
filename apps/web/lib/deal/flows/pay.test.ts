/** A second wallet button reuses the open order; the capture decides the method. */
import { describe, expect, it } from "vitest";
import { createServices } from "../../services";
import { loadSnapshot } from "../snapshot";
import { agree } from "./agree";
import { captureOrder, createOrder, fundingSourceOf } from "./pay";
import { runReview } from "./review";
import { startDemoDeal } from "./start";

async function agreedDeal() {
  const services = createServices({}, () => {});
  const deal = await startDemoDeal(services, "clean-ps5");
  await runReview(services, deal.id);
  await agree(services, deal.id, "seller", false);
  await agree(services, deal.id, "buyer", true);
  return { services, id: deal.id };
}

describe("createOrder", () => {
  it("returns the open order when a second button is pressed: one event, method kept", async () => {
    const { services, id } = await agreedDeal();
    const first = await createOrder(services, id, "venmo");
    const second = await createOrder(services, id, "paypal");
    expect(second.paypalOrderId).toBe(first.paypalOrderId);
    expect(second.method).toBe("venmo");
    const snap = await loadSnapshot(services, id);
    expect(snap.events.filter((e) => e.kind === "payment_created")).toHaveLength(1);
    expect(snap.deal.state).toBe("PAYMENT_PENDING");

    const captured = await captureOrder(services, id, first.paypalOrderId);
    expect(captured.status).toBe("CAPTURED");
    expect(captured.method).toBe("venmo");
    expect((await loadSnapshot(services, id)).deal.state).toBe("PAID");
  });

  it("fills a null method on reuse", async () => {
    const { services, id } = await agreedDeal();
    const first = await createOrder(services, id, "paypal");
    await services.store.savePayment({ ...first, method: null });
    const again = await createOrder(services, id, "venmo");
    expect(again.paypalOrderId).toBe(first.paypalOrderId);
    expect(again.method).toBe("venmo");
  });
});

describe("fundingSourceOf", () => {
  it("reads the wallet from PayPal's payment_source and ignores bodies that do not say", () => {
    expect(fundingSourceOf({ payment_source: { venmo: { email_address: "b@example.com" } } })).toBe("venmo");
    expect(fundingSourceOf({ payment_source: { paypal: { email_address: "b@example.com" } } })).toBe("paypal");
    expect(fundingSourceOf({ payment_source: { card: {} } })).toBeNull();
    expect(fundingSourceOf({ id: "x" })).toBeNull();
    expect(fundingSourceOf(null)).toBeNull();
  });
});
