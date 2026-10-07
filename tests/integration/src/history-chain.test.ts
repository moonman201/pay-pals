/**
 * Tamper-evident history across the store and the PayPal record. The store
 * hash-chains every event it appends; the chain head at order time is written
 * onto the payment record and into the PayPal custom_id. Afterwards the
 * stored events must still reproduce that head, and an edited copy must not.
 */
import { describe, expect, it } from "vitest";
import { cleanPs5, historyMatchesHead, parseCustomId, verifyChain } from "@pay-pals/contracts";
import type { DealEvent, PaymentRecord } from "@pay-pals/contracts";
import { createBuyerPal, createFixturePriceLookup } from "@pay-pals/agents";
import { buildOrderBody } from "@pay-pals/paypal";
import { driveTo, seedFixture } from "./seed";
import type { SeededDeal } from "./seed";

const buyerPal = createBuyerPal({ anthropic: null, priceLookup: createFixturePriceLookup() });

interface PaidDeal {
  seeded: SeededDeal;
  payment: PaymentRecord;
  /** Events as they stood when the order was created. */
  eventsAtOrder: DealEvent[];
}

/** The full clean deal through the store: invite, join, review, agree and lock, order with the chain head, pay, ship, deliver, complete. */
async function driveCleanDeal(): Promise<PaidDeal> {
  const seeded = await seedFixture(cleanPs5);
  const { store, dealId } = seeded;
  await store.appendEvent({ dealId, kind: "seller_invited", actor: "system", summary: "Invite sent to the seller's PayPal email.", at: new Date().toISOString() });
  await store.transition(dealId, "INVITED", "system", "Waiting for the seller.");
  await store.markSellerJoined(dealId);
  await store.transition(dealId, "LISTED", "system", "Listed.");

  const card = (await store.getCurrentCard(dealId))!;
  const { data: verdict } = await buyerPal.review(card, await store.listMessages(dealId, "deal"), { seller: cleanPs5.seller, sellerJoined: true });
  await store.saveVerdict(verdict);
  await store.transition(dealId, "REVIEWED", "system", "Reviewed.");
  await store.recordAgreement(dealId, "buyer");
  await store.recordAgreement(dealId, "seller");
  const locked = await store.lockCard(dealId, card.version);
  // The store locks silently; apps/web writes the timeline line, so the drive does too.
  await store.appendEvent({ dealId, kind: "card_locked", actor: "system", summary: `Both sides agreed. Card version ${card.version} is locked.`, at: new Date().toISOString() });
  await store.transition(dealId, "AGREED", "seller", "Agreed.");

  const eventsAtOrder = await store.listEvents(dealId);
  const head = verifyChain(eventsAtOrder);
  expect(head.ok).toBe(true);
  const body = buildOrderBody(locked, dealId, head.head);
  const payment = await store.savePayment({
    ...seeded.payment!,
    paypalOrderId: "ORDER-WITH-HISTORY",
    captureId: null,
    status: "CREATED",
    capturedAt: null,
    historyHash: head.head,
  });
  await store.appendEvent({
    dealId,
    kind: "payment_created",
    actor: "paypal",
    summary: `PayPal checkout order created, payee ${locked.sellerPaypalEmail}.`,
    data: { orderId: payment.paypalOrderId, customId: body.purchase_units[0].custom_id },
    at: new Date().toISOString(),
  });
  await store.transition(dealId, "PAYMENT_PENDING", "system", "Payment pending.");
  await store.savePayment({ ...payment, status: "CAPTURED", captureId: "CAPTURE-1", capturedAt: new Date().toISOString() });
  await store.appendEvent({ dealId, kind: "payment_captured", actor: "paypal", summary: "Payment of $420.00 captured.", at: new Date().toISOString() });
  await store.transition(dealId, "PAID", "system", "Paid.");
  await store.saveShipment(seeded.shipment!);
  await store.transition(dealId, "SHIPPED", "seller", "Shipped.");
  await store.transition(dealId, "DELIVERED", "buyer", "Delivered.");
  await store.transition(dealId, "COMPLETE", "buyer", "Complete.");
  return { seeded, payment: (await store.getPayment(dealId))!, eventsAtOrder };
}

describe("hash-chained history", () => {
  it("every stored event links to the one before it, from the first to the last", async () => {
    const { seeded } = await driveCleanDeal();
    const events = await seeded.store.listEvents(seeded.dealId);

    expect(events.length).toBeGreaterThan(10);
    expect(events[0]!.prevHash).toBeNull();
    for (let i = 1; i < events.length; i++) expect(events[i]!.prevHash).toBe(events[i - 1]!.hash);
    for (const e of events) expect(e.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(events.map((e) => e.hash)).size).toBe(events.length);

    const chain = verifyChain(events);
    expect(chain).toEqual({ ok: true, head: events[events.length - 1]!.hash, brokenAt: null });
    expect(events.map((e) => e.kind)).toEqual(expect.arrayContaining(["seller_invited", "seller_joined", "agreed", "card_locked", "payment_created", "payment_captured"]));
  });

  it("the payment carries the head at order time, and later events do not change what it proves", async () => {
    const { seeded, payment, eventsAtOrder } = await driveCleanDeal();
    const events = await seeded.store.listEvents(seeded.dealId);

    expect(payment.historyHash).toBe(verifyChain(eventsAtOrder).head);
    expect(payment.historyHash).toBe(eventsAtOrder[eventsAtOrder.length - 1]!.hash);
    expect(events.length).toBeGreaterThan(eventsAtOrder.length);
    expect(verifyChain(events).head).not.toBe(payment.historyHash);
    expect(historyMatchesHead(events, payment.historyHash!)).toBe(true);

    const orderEvent = events.find((e) => e.kind === "payment_created")!;
    expect(parseCustomId(String(orderEvent.data!.customId))).toEqual({ dealId: seeded.dealId, historyHash: payment.historyHash });
  });

  it("an edited copy of the history no longer reproduces the recorded head", async () => {
    const { seeded, payment } = await driveCleanDeal();
    const events = await seeded.store.listEvents(seeded.dealId);
    const at = events.findIndex((e) => e.kind === "card_locked");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(events.findIndex((e) => e.kind === "payment_created"));

    // One word changed on an event that sits before the recorded head.
    const edited = events.map((e, i) => (i === at ? { ...e, summary: "Both sides agreed. Card version 9 is locked." } : e));
    const broken = verifyChain(edited);
    expect(broken.ok).toBe(false);
    expect(broken.brokenAt).toBe(at);
    expect(historyMatchesHead(edited, payment.historyHash!)).toBe(false);

    const dropped = events.filter((_, i) => i !== at);
    expect(verifyChain(dropped).ok).toBe(false);
    expect(historyMatchesHead(dropped, payment.historyHash!)).toBe(false);

    const unknownHead = "f".repeat(64);
    expect(historyMatchesHead(events, unknownHead)).toBe(false);
  });

  it("the store ignores hashes a caller might try to pass and computes its own", async () => {
    const seeded = await seedFixture(cleanPs5);
    const { store, dealId } = seeded;
    await driveTo(seeded, "LISTED");
    const before = await store.listEvents(dealId);
    const forged = { dealId, kind: "card_updated" as const, actor: "seller_pal" as const, summary: "Forged.", at: new Date().toISOString(), prevHash: "0".repeat(64), hash: "1".repeat(64) };
    const stored = await store.appendEvent(forged as never);
    expect(stored.prevHash).toBe(before[before.length - 1]!.hash);
    expect(stored.hash).not.toBe("1".repeat(64));
    expect(verifyChain(await store.listEvents(dealId)).ok).toBe(true);
  });
});
