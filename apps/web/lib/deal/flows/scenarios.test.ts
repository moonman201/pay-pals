/**
 * The three demo scenarios, driven end to end through the flows on the real
 * packages with no keys: the in-memory store from @pay-pals/db, the real pals
 * from @pay-pals/agents running rules only, fixture prices, and the mock
 * PayPal gateway. This is what the deal room does when a judge clicks.
 */
import { describe, expect, it } from "vitest";
import { createServices } from "../../services";
import { loadSnapshot } from "../snapshot";
import { agree } from "./agree";
import { checkArrival } from "./arrival";
import { applyBuyerRequest } from "./card";
import { completeDeal, reportIssue } from "./close";
import { captureOrder, createOrder } from "./pay";
import { runReview } from "./review";
import { confirmDelivery, markShipped } from "./ship";
import { startDemoDeal } from "./start";

const quiet = () => {};
const noKeys = () => createServices({}, quiet);
type Services = ReturnType<typeof createServices>;

/** Both sides agree to the current card. Seller first, then the buyer locks it. */
async function agreeBoth(services: Services, dealId: string) {
  await agree(services, dealId, "seller", false);
  await agree(services, dealId, "buyer", false);
}

async function payAndShip(services: Services, dealId: string, method: "paypal" | "venmo") {
  const payment = await createOrder(services, dealId, method);
  await captureOrder(services, dealId, payment.paypalOrderId);
  const snap = await loadSnapshot(services, dealId);
  const packing = snap.demo?.packing;
  if (!packing) throw new Error("expected packing hints");
  await markShipped(services, dealId, { carrier: packing.carrier, trackingNumber: packing.trackingNumber, packingPhotos: packing.photos, doneIds: snap.checklist?.map((c) => c.id) ?? [] });
  return packing;
}

describe("scam-garmin", () => {
  it("ends BLOCKED at review with payment-method flags and no order", async () => {
    const services = noKeys();
    const deal = await startDemoDeal(services, "scam-garmin");
    expect(deal.state).toBe("LISTED");

    const verdict = await runReview(services, deal.id);
    expect(verdict.overall).toBe("stop");
    const codes = verdict.flags.map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(["FRIENDS_AND_FAMILY_REQUEST", "PRICE_FAR_BELOW_MARKET", "URGENCY_PRESSURE"]));

    const snap = await loadSnapshot(services, deal.id);
    expect(snap.deal.state).toBe("BLOCKED");
    expect(snap.payment).toBeNull();
    await expect(agree(services, deal.id, "buyer", true)).rejects.toThrow();
  });
});

describe("clean-garmin", () => {
  it("runs review, a seller photo update, both agreements, pay, ship, deliver, arrival match, complete", async () => {
    const services = noKeys();
    const deal = await startDemoDeal(services, "clean-garmin");

    const v1 = await runReview(services, deal.id);
    expect(v1.overall).toBe("go");
    expect(v1.flags).toEqual([]);
    expect(v1.priceCheck?.marketLow).toBe(420);

    let snap = await loadSnapshot(services, deal.id);
    const photo = snap.demo?.requestPhotos[0];
    if (!photo) throw new Error("expected a demo photo to add");
    const card2 = await applyBuyerRequest(services, deal.id, { request: { field: "photos", request: "Battery page" }, sellerReply: "Added. About 11 days in smartwatch mode.", photos: [photo] });
    expect(card2.version).toBe(2);
    expect(card2.photos.map((p) => p.url)).toContain(photo.url);
    snap = await loadSnapshot(services, deal.id);
    expect(snap.deal.state).toBe("LISTED");
    expect(snap.cards).toHaveLength(2);

    const v2 = await runReview(services, deal.id);
    expect(v2.overall).toBe("go");
    expect(v2.cardVersion).toBe(2);

    await agree(services, deal.id, "buyer", false);
    snap = await loadSnapshot(services, deal.id);
    expect(snap.deal.state).toBe("REVIEWED");
    expect(snap.deal.buyerAgreedAt).not.toBeNull();
    expect(snap.deal.sellerAgreedAt).toBeNull();
    expect(snap.lockedCard).toBeNull();

    await agree(services, deal.id, "seller", false);
    snap = await loadSnapshot(services, deal.id);
    expect(snap.deal.state).toBe("AGREED");
    expect(snap.lockedCard?.version).toBe(2);
    expect(snap.lockedCard?.lockedAt).not.toBeNull();
    expect(snap.events.filter((e) => e.kind === "agreed")).toHaveLength(2);

    const payment = await createOrder(services, deal.id, "paypal");
    expect(payment.rawOrder).toMatchObject({ id: payment.paypalOrderId });
    expect((await loadSnapshot(services, deal.id)).deal.state).toBe("PAYMENT_PENDING");
    const captured = await captureOrder(services, deal.id, payment.paypalOrderId);
    expect(captured.status).toBe("CAPTURED");
    expect(captured.payeeEmail).toBe("luis.o@example.com");
    expect(captured.rawCapture).toMatchObject({ status: "COMPLETED" });
    snap = await loadSnapshot(services, deal.id);
    expect(snap.deal.state).toBe("PAID");
    expect(snap.checklist?.length).toBeGreaterThan(0);

    const packing = snap.demo?.packing;
    if (!packing) throw new Error("expected packing hints");
    await markShipped(services, deal.id, { carrier: packing.carrier, trackingNumber: packing.trackingNumber, packingPhotos: packing.photos, doneIds: snap.checklist?.map((c) => c.id) ?? [] });
    expect((await loadSnapshot(services, deal.id)).deal.state).toBe("SHIPPED");

    await confirmDelivery(services, deal.id);
    snap = await loadSnapshot(services, deal.id);
    expect(snap.deal.state).toBe("DELIVERED");

    const check = await checkArrival(services, deal.id, snap.demo?.arrivalPhotos ?? []);
    expect(check.matches).toBe(true);
    expect(check.observed.serial).toBe("7LP045912");
    expect(check.photos?.length).toBe(snap.demo?.arrivalPhotos.length);

    await completeDeal(services, deal.id);
    snap = await loadSnapshot(services, deal.id);
    expect(snap.deal.state).toBe("COMPLETE");
    expect(snap.events.map((e) => e.kind)).toEqual(expect.arrayContaining(["agreed", "card_locked", "payment_created", "payment_captured", "shipped", "delivered", "arrival_checked"]));
  });
});

describe("wrong-item", () => {
  it("reaches ISSUE with a serial and model mismatch and an evidence pack holding the arrival photos", async () => {
    const services = noKeys();
    const deal = await startDemoDeal(services, "wrong-item");

    const v = await runReview(services, deal.id);
    expect(v.overall).toBe("go");
    await agreeBoth(services, deal.id);
    await payAndShip(services, deal.id, "venmo");
    await confirmDelivery(services, deal.id);
    let snap = await loadSnapshot(services, deal.id);

    const arrivalPhotos = snap.demo?.arrivalPhotos ?? [];
    const check = await checkArrival(services, deal.id, arrivalPhotos);
    expect(check.matches).toBe(false);
    expect(check.mismatches.map((m) => m.field)).toEqual(expect.arrayContaining(["serial", "model"]));
    expect(check.observed.serial).toBe("6XR118204");

    await reportIssue(services, deal.id, "arrival_mismatch");
    snap = await loadSnapshot(services, deal.id);
    expect(snap.deal.state).toBe("ISSUE");
    expect(snap.hasEvidence).toBe(true);
    const pack = await services.store.getEvidence(deal.id);
    expect(pack?.lockedCard.serial).toBe("7LP091337");
    expect(pack?.arrivalCheck?.matches).toBe(false);
    for (const photo of arrivalPhotos) expect(pack?.photos.map((p) => p.url)).toContain(photo.url);
  });
});

describe("issue before delivery", () => {
  it("lets the buyer open an issue from SHIPPED when the item never arrives, with an evidence pack", async () => {
    const services = noKeys();
    const deal = await startDemoDeal(services, "clean-garmin");
    await runReview(services, deal.id);
    await agreeBoth(services, deal.id);
    const payment = await createOrder(services, deal.id, "paypal");
    await captureOrder(services, deal.id, payment.paypalOrderId);

    await expect(reportIssue(services, deal.id, "arrival_mismatch")).rejects.toThrow(/not a reason/);

    let snap = await loadSnapshot(services, deal.id);
    const packing = snap.demo?.packing;
    if (!packing) throw new Error("expected packing hints");
    await markShipped(services, deal.id, { carrier: packing.carrier, trackingNumber: packing.trackingNumber, packingPhotos: packing.photos, doneIds: [] });
    await reportIssue(services, deal.id, "not_arrived", "Tracking has not moved in two weeks.");
    snap = await loadSnapshot(services, deal.id);
    expect(snap.deal.state).toBe("ISSUE");
    expect(snap.hasEvidence).toBe(true);
    const pack = await services.store.getEvidence(deal.id);
    expect(pack?.arrivalCheck).toBeNull();
    expect(pack?.shipment?.trackingNumber).toBe(packing.trackingNumber);
    expect(snap.events.at(-2)?.summary).toContain("never arrived");
  });
});

describe("two-sided agreement", () => {
  it("clears the buyer's agreement when the seller changes the card, so the buyer agrees again", async () => {
    const services = noKeys();
    const deal = await startDemoDeal(services, "clean-garmin");
    await runReview(services, deal.id);
    await agree(services, deal.id, "buyer", false);
    let snap = await loadSnapshot(services, deal.id);
    expect(snap.deal.buyerAgreedAt).not.toBeNull();

    const photo = snap.demo?.requestPhotos[0];
    if (!photo) throw new Error("expected a demo photo to add");
    await applyBuyerRequest(services, deal.id, { request: { field: "photos", request: "Battery page" }, sellerReply: "Added the battery page.", photos: [photo] });
    snap = await loadSnapshot(services, deal.id);
    expect(snap.deal.state).toBe("LISTED");
    expect(snap.deal.buyerAgreedAt).toBeNull();
    expect(snap.deal.sellerAgreedAt).toBeNull();
    expect(snap.deal.currentCardVersion).toBe(2);

    await runReview(services, deal.id);
    await agree(services, deal.id, "seller", false);
    snap = await loadSnapshot(services, deal.id);
    expect(snap.deal.state).toBe("REVIEWED");
    expect(snap.lockedCard).toBeNull();

    await agree(services, deal.id, "buyer", false);
    snap = await loadSnapshot(services, deal.id);
    expect(snap.deal.state).toBe("AGREED");
    expect(snap.lockedCard?.version).toBe(2);
    const agreedEvents = snap.events.filter((e) => e.kind === "agreed");
    expect(agreedEvents.map((e) => e.data?.cardVersion)).toEqual([1, 2, 2]);
  });

  it("agreeing twice from the same side is harmless and the seller's agree ignores the buyer's flags", async () => {
    const services = noKeys();
    const deal = await startDemoDeal(services, "wrong-item");
    await runReview(services, deal.id);
    await agree(services, deal.id, "seller", false);
    await agree(services, deal.id, "seller", false);
    const snap = await loadSnapshot(services, deal.id);
    expect(snap.events.filter((e) => e.kind === "agreed")).toHaveLength(1);
    expect(snap.deal.state).toBe("REVIEWED");
  });
});
