/**
 * The PAID, SHIPPED and DELIVERED to ISSUE transition, proved against a body
 * PayPal actually sent.
 *
 * Every other dispute test in this repo replays a resource we wrote
 * ourselves, so it can only prove that the handler agrees with our own idea
 * of the shape. `fixtures/customer-dispute-created.json` is the real
 * `CUSTOMER.DISPUTE.CREATED` event PayPal delivered to our deployed webhook
 * for case PP-R-BWV-10190936, fetched back out of PayPal's own event store
 * (see that folder's README for provenance and the one field scrubbed).
 *
 * The real body differs from the synthetic one in four ways that would break
 * an integration written against the guess, and each has a test here:
 * the dispute id is a `PP-R-` inquiry and not a `PP-D-` dispute; the status
 * is UNDER_REVIEW and not OPEN; the seller is a merchant id and a display
 * name with no email anywhere; and the disputed transaction carries a
 * buyer-side transaction id beside the seller-side one.
 *
 * No network and no key: the file is read off disk.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { emptyBox, parseCustomId } from "@pay-pals/contracts";
import type { DealState, PaymentRecord, WebhookEvent } from "@pay-pals/contracts";
import { handleWebhookEvent } from "@pay-pals/paypal";
import { driveTo, seedFixture } from "./seed";
import type { SeededDeal } from "./seed";

const FIXTURE = resolve(fileURLToPath(import.meta.url), "..", "fixtures", "customer-dispute-created.json");
const RAW = readFileSync(FIXTURE, "utf8");

interface DisputedTransaction {
  buyer_transaction_id?: string;
  seller_transaction_id?: string;
  invoice_number?: string;
  custom?: string;
  seller?: Record<string, unknown>;
  items?: { item_id?: string; item_name?: string; notes?: string }[];
}

interface DisputeEvent extends WebhookEvent {
  resource: {
    dispute_id: string;
    status: string;
    reason: string;
    dispute_life_cycle_stage: string;
    dispute_channel: string;
    create_time: string;
    disputed_transactions: DisputedTransaction[];
    messages?: { posted_by: string; content: string }[];
    [key: string]: unknown;
  };
}

/** A fresh copy of the recorded event, so one test cannot see another's edits. */
function recorded(): DisputeEvent {
  return JSON.parse(RAW) as DisputeEvent;
}

/**
 * The recorded event with its deal id pointed at a deal that exists in this
 * run. The chain head PayPal sent back is kept, so `custom` holds the real
 * `dealId#hash` shape and not a bare id.
 */
function replayFor(dealId: string): DisputeEvent {
  const event = recorded();
  const tx = event.resource.disputed_transactions[0]!;
  tx.custom = `${dealId}#${parseCustomId(tx.custom!).historyHash}`;
  tx.invoice_number = dealId;
  return event;
}

const CAPTURE_ID = "35F21684R9839603W";
const BUYER_TRANSACTION_ID = "8Y700853H3509722W";

/** The empty-box deal at `state`, with a captured payment, as the store holds it when a dispute lands. */
async function deliveredWithCapture(state: DealState): Promise<SeededDeal> {
  const seeded = await seedFixture(emptyBox);
  await driveTo(seeded, "AGREED");
  const card = (await seeded.store.getCurrentCard(seeded.dealId))!;
  await seeded.store.lockCard(seeded.dealId, card.version);
  for (const next of ["PAYMENT_PENDING", "PAID", "SHIPPED", "DELIVERED"] as const) {
    if ((await seeded.store.getDeal(seeded.dealId))!.state === state) break;
    await seeded.store.transition(seeded.dealId, next, "system", `${next}.`);
  }
  const payment: PaymentRecord = {
    ...seeded.payment!,
    paypalOrderId: "3AC53712FN382781N",
    captureId: CAPTURE_ID,
    status: "CAPTURED",
    capturedAt: "2026-10-10T16:30:00Z",
  };
  await seeded.store.savePayment(payment);
  return seeded;
}

describe("the recorded CUSTOMER.DISPUTE.CREATED event", () => {
  it("is PayPal's own body, and carries nothing that identifies an account", () => {
    const event = recorded();
    expect(event.id).toBe("WH-2K820509XY442320B-2X675859T8400442R");
    expect(event.event_type).toBe("CUSTOMER.DISPUTE.CREATED");
    expect(event.resource_type).toBe("dispute");
    expect(RAW, "an email address reached a committed fixture").not.toMatch(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
    expect(RAW, "the sandbox merchant id was not scrubbed").not.toContain("WUYUYZFRBWFT4");
  });

  it("is an inquiry under review, not the OPEN PP-D dispute our synthetic body assumed", () => {
    const { resource } = recorded();
    // PayPal puts the buyer in touch with the seller first: PP-R is the pre-dispute stage.
    expect(resource.dispute_id).toMatch(/^PP-R-/);
    expect(resource.status).toBe("UNDER_REVIEW");
    expect(resource.dispute_life_cycle_stage).toBe("INQUIRY");
    expect(resource.dispute_channel).toBe("INTERNAL");
    expect(resource.reason).toBe("MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED");
    // The handler reads resource.dispute_id, falling back to resource.id. PayPal sends no resource.id here.
    expect(resource.id).toBeUndefined();
  });

  it("names the seller by merchant id, with no email on the transaction", () => {
    const tx = recorded().resource.disputed_transactions[0]!;
    expect(tx.seller).toBeDefined();
    expect(Object.keys(tx.seller!)).toEqual(expect.arrayContaining(["merchant_id", "name"]));
    expect(tx.seller).not.toHaveProperty("email");
  });

  it("carries our deal id, our chain head and our locked card text back to us", () => {
    const tx = recorded().resource.disputed_transactions[0]!;
    expect(tx.invoice_number).toMatch(/^[0-9a-f-]{36}$/);
    // custom is dealId#historyHash, and PayPal returned it intact: parseCustomId reads the real string.
    const parsed = parseCustomId(tx.custom!);
    expect(parsed.dealId).toBe(tx.invoice_number);
    expect(parsed.historyHash).toMatch(/^[0-9a-f]{64}$/);
    // The line item we put on the order is what PayPal disputes.
    expect(tx.items?.[0]?.item_id).toBe("AJ164952580");
    expect(tx.items?.[0]?.item_name).toContain("Sony PlayStation 5 disc edition");
  });

  it("carries a buyer-side transaction id that is not the capture id we store", () => {
    const tx = recorded().resource.disputed_transactions[0]!;
    expect(tx.seller_transaction_id).toBe(CAPTURE_ID);
    expect(tx.buyer_transaction_id).toBe(BUYER_TRANSACTION_ID);
    expect(tx.buyer_transaction_id).not.toBe(tx.seller_transaction_id);
    // The Resolution Center and the create-dispute API both address the buyer's id, so the
    // two are not interchangeable when someone follows our records back into PayPal.
    // What the handler records is asserted below. See REVIEW.md, 2026-10-10, packages/paypal.
  });
});

describe("replaying the real event through handleWebhookEvent", () => {
  for (const state of ["PAID", "SHIPPED", "DELIVERED"] as const) {
    it(`moves a ${state} deal to ISSUE and marks the payment DISPUTED`, async () => {
      const seeded = await deliveredWithCapture(state);
      const { store, dealId } = seeded;
      expect((await store.getDeal(dealId))!.state).toBe(state);

      const outcome = await handleWebhookEvent(replayFor(dealId), store);

      expect(outcome).toMatchObject({ handled: true, duplicate: false, retry: false, dealId });
      expect(outcome.eventId).toBe("WH-2K820509XY442320B-2X675859T8400442R");
      expect((await store.getDeal(dealId))!.state).toBe("ISSUE");
      expect((await store.getPayment(dealId))!.status).toBe("DISPUTED");

      const events = await store.listEvents(dealId);
      expect(events.at(-1)).toMatchObject({ kind: "state_changed", fromState: state, toState: "ISSUE" });

      const opened = events.filter((e) => e.kind === "dispute_opened");
      expect(opened).toHaveLength(1);
      expect(opened[0]!.summary).toContain("PP-R-BWV-10190936");
      expect(opened[0]!.summary).toContain("MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED");
      expect(opened[0]!.data).toMatchObject({
        disputeId: "PP-R-BWV-10190936",
        reason: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED",
        // The seller-side capture id, which is the one our payment row holds.
        captureId: CAPTURE_ID,
      });
      expect((await store.getPayment(dealId))!.captureId).toBe(opened[0]!.data!.captureId);
      // The buyer's own id for the same money is in the body and is not recorded anywhere.
      expect(JSON.stringify(opened[0]!.data)).not.toContain(BUYER_TRANSACTION_ID);
    });
  }

  it("resolves the deal from the real custom field alone when PayPal sends no invoice_number", async () => {
    const seeded = await deliveredWithCapture("DELIVERED");
    const { store, dealId } = seeded;
    const event = replayFor(dealId);
    delete event.resource.disputed_transactions[0]!.invoice_number;
    expect(event.resource.disputed_transactions[0]!.custom).toMatch(/^[0-9a-f-]{36}#[0-9a-f]{64}$/);

    const outcome = await handleWebhookEvent(event, store);

    expect(outcome).toMatchObject({ handled: true, dealId });
    expect((await store.getDeal(dealId))!.state).toBe("ISSUE");
  });

  it("is handled once when PayPal resends it, which its own resend link invites", async () => {
    const seeded = await deliveredWithCapture("DELIVERED");
    const { store, dealId } = seeded;

    const first = await handleWebhookEvent(replayFor(dealId), store);
    const second = await handleWebhookEvent(replayFor(dealId), store);

    expect(first).toMatchObject({ handled: true, duplicate: false });
    expect(second).toMatchObject({ handled: false, duplicate: true });
    expect((await store.listEvents(dealId)).filter((e) => e.kind === "dispute_opened")).toHaveLength(1);
  });

  it("asks PayPal to redeliver when the dispute names a deal we do not hold", async () => {
    const seeded = await deliveredWithCapture("DELIVERED");
    const { store } = seeded;

    // The event verbatim: its deal id belongs to a deal that is not in this store.
    const outcome = await handleWebhookEvent(recorded(), store);

    expect(outcome.handled).toBe(false);
    expect(outcome.note).toContain("does not match a Pay Pals deal");
    expect((await store.getDeal(seeded.dealId))!.state).toBe("DELIVERED");
  });

  it("stamps the event with PayPal's delivery time, which is minutes after the dispute was filed", async () => {
    const event = recorded();
    const filed = new Date(event.resource.create_time).getTime();
    const delivered = new Date(event.create_time).getTime();
    expect(delivered).toBeGreaterThan(filed);
    // Three and a half minutes on the real delivery: a demo must not stand still waiting for it.
    expect(delivered - filed).toBeGreaterThan(60_000);

    const seeded = await deliveredWithCapture("DELIVERED");
    await handleWebhookEvent(replayFor(seeded.dealId), seeded.store);
    const opened = (await seeded.store.listEvents(seeded.dealId)).find((e) => e.kind === "dispute_opened")!;
    expect(opened.data!.paypalTime).toBe(event.create_time);
  });
});
