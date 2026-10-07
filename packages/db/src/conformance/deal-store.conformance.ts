/**
 * One behavior suite, run against every DealStore implementation, so the
 * memory store and the Postgres store cannot drift. Each implementation's
 * test file calls runDealStoreConformance with a factory.
 */
import { describe, expect, it } from "vitest";
import { IllegalTransitionError, getFixture } from "@pay-pals/contracts";
import type { ItemCard, Party } from "@pay-pals/contracts";
import { AgreementNotAllowedError, CardLockedError, CardNotEditableError, CardVersionError, DealNotFoundError } from "../errors";
import type { PayPalsStore } from "@pay-pals/contracts";

const fx = getFixture("clean-ps5");
const seller: Party = fx.seller;
const buyer: Party = fx.buyer;

const HAPPY_PATH = ["LISTED", "REVIEWED", "AGREED", "PAYMENT_PENDING", "PAID", "SHIPPED", "DELIVERED", "COMPLETE"] as const;

/** Walks the happy path up to and including `target`, starting from wherever the deal is. */
async function toState(store: PayPalsStore, dealId: string, target: (typeof HAPPY_PATH)[number]): Promise<void> {
  const current = (await store.getDeal(dealId))!.state;
  const from = current === "DRAFT" ? 0 : HAPPY_PATH.indexOf(current as (typeof HAPPY_PATH)[number]) + 1;
  for (const next of HAPPY_PATH.slice(from, HAPPY_PATH.indexOf(target) + 1)) {
    await store.transition(dealId, next, "system", `${next}.`);
  }
}

export function runDealStoreConformance(name: string, makeStore: () => Promise<PayPalsStore>) {
  const cardFor = (dealId: string, version: number, overrides: Partial<ItemCard> = {}): ItemCard => ({
    ...fx.cards[0]!,
    dealId,
    version,
    lockedAt: null,
    ...overrides,
  });

  describe(`${name}: DealStore conformance`, () => {
    describe("deals", () => {
      it("creates a DRAFT deal with no card and no buyer", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ seller, scenario: "clean-ps5" });
        expect(deal.state).toBe("DRAFT");
        expect(deal.currentCardVersion).toBe(0);
        expect(deal.lockedCardVersion).toBeNull();
        expect(deal.buyerAgreedAt).toBeNull();
        expect(deal.sellerAgreedAt).toBeNull();
        expect(deal.buyer).toBeNull();
        expect(deal.scenario).toBe("clean-ps5");
        expect(await store.getDeal(deal.id)).toEqual(deal);
      });

      it("returns null for an unknown deal", async () => {
        const store = await makeStore();
        expect(await store.getDeal("00000000-0000-4000-8000-000000000000")).toBeNull();
      });

      it("sets the buyer when they open the link", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ seller });
        const updated = await store.setBuyer(deal.id, buyer);
        expect(updated.buyer).toEqual(buyer);
        expect((await store.getDeal(deal.id))?.buyer).toEqual(buyer);
      });

      it("finds deals by scenario and state, oldest first", async () => {
        const store = await makeStore();
        const pause = () => new Promise((r) => setTimeout(r, 3));
        const a = await store.createDeal({ seller, scenario: "clean-ps5" });
        await pause();
        const b = await store.createDeal({ seller, scenario: "clean-ps5" });
        await pause();
        const c = await store.createDeal({ seller, scenario: "scam-ps5" });
        await pause();
        const none = await store.createDeal({ seller });
        await toState(store, b.id, "AGREED");
        await toState(store, c.id, "LISTED");
        // A durable store is shared across this suite, so look only at the deals made here (order preserved).
        const mine = new Set([a.id, b.id, c.id, none.id]);
        const find = async (query: Parameters<typeof store.findDeals>[0]) =>
          (await store.findDeals(query)).map((d) => d.id).filter((id) => mine.has(id));

        // Scenario only, both states, oldest first.
        expect(await find({ scenario: "clean-ps5" })).toEqual([a.id, b.id]);
        // Scenario and states.
        expect(await find({ scenario: "clean-ps5", states: ["AGREED", "COMPLETE"] })).toEqual([b.id]);
        expect(await find({ scenario: "clean-ps5", states: ["DRAFT"] })).toEqual([a.id]);
        // No match.
        expect(await find({ scenario: "empty-box" })).toEqual([]);
        expect(await find({ scenario: "scam-ps5", states: ["COMPLETE"] })).toEqual([]);
        expect(await store.findDeals({ scenario: "clean-ps5", states: [] })).toEqual([]);
        // scenario: null means deals that have none; states alone spans scenarios.
        expect(await find({ scenario: null })).toEqual([none.id]);
        expect(await find({ states: ["LISTED"] })).toEqual([c.id]);
        // Ordering is by createdAt across the whole result, and rows are full deals.
        const all = await store.findDeals({ scenario: "clean-ps5" });
        const times = all.map((d) => Date.parse(d.createdAt));
        expect([...times].sort((x, y) => x - y)).toEqual(times);
        expect(all.find((d) => d.id === a.id)).toEqual(await store.getDeal(a.id));
      });

      it("rejects every write against an unknown deal with DealNotFoundError", async () => {
        const store = await makeStore();
        const ghost = "00000000-0000-4000-8000-000000000000";
        await expect(store.setBuyer(ghost, buyer)).rejects.toBeInstanceOf(DealNotFoundError);
        await expect(store.transition(ghost, "LISTED", "system", "x")).rejects.toBeInstanceOf(DealNotFoundError);
        await expect(store.saveCard(cardFor(ghost, 1))).rejects.toBeInstanceOf(DealNotFoundError);
        await expect(store.lockCard(ghost, 1)).rejects.toBeInstanceOf(DealNotFoundError);
        await expect(store.addMessage({ dealId: ghost, channel: "deal", author: "buyer", text: "hi", photos: [], at: "2026-01-01T00:00:00.000Z" })).rejects.toBeInstanceOf(DealNotFoundError);
        await expect(store.appendEvent({ dealId: ghost, kind: "deal_created", actor: "system", summary: "x", at: "2026-01-01T00:00:00.000Z" })).rejects.toBeInstanceOf(DealNotFoundError);
        await expect(store.savePayment({ ...fx.payment!, dealId: ghost })).rejects.toBeInstanceOf(DealNotFoundError);
        await expect(store.saveShipment({ ...fx.shipment!, dealId: ghost })).rejects.toBeInstanceOf(DealNotFoundError);
        await expect(store.saveVerdict({ dealId: ghost, cardVersion: 1, overall: "go", flags: [], priceCheck: null, questionsForSeller: [], palMessage: "ok", createdAt: "2026-01-01T00:00:00.000Z" })).rejects.toBeInstanceOf(DealNotFoundError);
      });
    });

    describe("state machine", () => {
      it("walks the happy path and records one state_changed event per step", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ seller, buyer });
        let state = deal.state;
        for (const next of HAPPY_PATH) {
          const moved = await store.transition(deal.id, next, "system", `Moved to ${next}.`);
          expect(moved.state).toBe(next);
          state = moved.state;
        }
        expect(state).toBe("COMPLETE");
        const events = await store.listEvents(deal.id);
        const changes = events.filter((e) => e.kind === "state_changed");
        expect(changes.map((e) => e.toState)).toEqual([...HAPPY_PATH]);
        expect(changes[0]).toMatchObject({ fromState: "DRAFT", toState: "LISTED", actor: "system", summary: "Moved to LISTED." });
      });

      it("rejects an illegal transition and leaves the deal untouched", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ seller });
        await expect(store.transition(deal.id, "PAID", "system", "skip ahead")).rejects.toBeInstanceOf(IllegalTransitionError);
        expect((await store.getDeal(deal.id))?.state).toBe("DRAFT");
        expect(await store.listEvents(deal.id)).toHaveLength(0);
      });

      it("rejects BLOCKED from anywhere but REVIEWED and ISSUE from anywhere but DELIVERED", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ seller });
        await store.transition(deal.id, "LISTED", "system", "Listed.");
        await expect(store.transition(deal.id, "BLOCKED", "buyer_pal", "stop")).rejects.toBeInstanceOf(IllegalTransitionError);
        await expect(store.transition(deal.id, "ISSUE", "buyer_pal", "stop")).rejects.toBeInstanceOf(IllegalTransitionError);
        await store.transition(deal.id, "REVIEWED", "system", "Reviewed.");
        const blocked = await store.transition(deal.id, "BLOCKED", "buyer_pal", "Buyer Pal stopped the deal.");
        expect(blocked.state).toBe("BLOCKED");
      });

      it("never leaves a terminal state", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ seller });
        await store.transition(deal.id, "CANCELLED", "seller", "Changed my mind.");
        await expect(store.transition(deal.id, "DRAFT", "seller", "undo")).rejects.toBeInstanceOf(IllegalTransitionError);
        await expect(store.transition(deal.id, "LISTED", "seller", "undo")).rejects.toBeInstanceOf(IllegalTransitionError);
      });

      it("rejects cancelling once money has moved", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ seller, buyer });
        for (const next of ["LISTED", "REVIEWED", "AGREED", "PAYMENT_PENDING", "PAID"] as const) {
          await store.transition(deal.id, next, "system", next);
        }
        await expect(store.transition(deal.id, "CANCELLED", "buyer", "refund me")).rejects.toBeInstanceOf(IllegalTransitionError);
      });
    });

    describe("item cards", () => {
      it("saves versions in order and tracks the current version on the deal", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ seller });
        const v1 = await store.saveCard(cardFor(deal.id, 1));
        expect(v1.lockedAt).toBeNull();
        const v2 = await store.saveCard(cardFor(deal.id, 2, { conditionNotes: "Battery holds 11 days." }));
        expect((await store.getDeal(deal.id))?.currentCardVersion).toBe(2);
        expect(await store.getCurrentCard(deal.id)).toEqual(v2);
        expect(await store.getCard(deal.id, 1)).toEqual(v1);
        expect(await store.getCard(deal.id, 9)).toBeNull();
        expect((await store.listCards(deal.id)).map((c) => c.version)).toEqual([1, 2]);
      });

      it("round-trips a price with cents", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ seller });
        const saved = await store.saveCard(cardFor(deal.id, 1, { askingPrice: 475.5 }));
        expect(saved.askingPrice).toBe(475.5);
        expect((await store.getCard(deal.id, 1))?.askingPrice).toBe(475.5);
      });

      it("rejects a version that is not the next one", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ seller });
        await expect(store.saveCard(cardFor(deal.id, 2))).rejects.toBeInstanceOf(CardVersionError);
        await store.saveCard(cardFor(deal.id, 1));
        await expect(store.saveCard(cardFor(deal.id, 1))).rejects.toBeInstanceOf(CardVersionError);
      });

      it("locks the current version at REVIEWED and then refuses new versions", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ seller });
        await store.saveCard(cardFor(deal.id, 1));
        await store.saveCard(cardFor(deal.id, 2));
        await toState(store, deal.id, "REVIEWED");
        const locked = await store.lockCard(deal.id, 2);
        expect(locked.lockedAt).not.toBeNull();
        expect((await store.getDeal(deal.id))?.lockedCardVersion).toBe(2);
        expect((await store.getCard(deal.id, 1))?.lockedAt).toBeNull();
        await expect(store.saveCard(cardFor(deal.id, 3))).rejects.toBeInstanceOf(CardLockedError);
        await expect(store.lockCard(deal.id, 1)).rejects.toBeInstanceOf(CardLockedError);
        // Locking the same version again is a no-op, not an error.
        expect((await store.lockCard(deal.id, 2)).lockedAt).toBe(locked.lockedAt);
      });

      it("only locks the current version", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ seller });
        await store.saveCard(cardFor(deal.id, 1));
        await store.saveCard(cardFor(deal.id, 2));
        await toState(store, deal.id, "REVIEWED");
        await expect(store.lockCard(deal.id, 1)).rejects.toBeInstanceOf(CardVersionError);
        expect((await store.getDeal(deal.id))?.lockedCardVersion).toBeNull();
        expect((await store.lockCard(deal.id, 2)).version).toBe(2);
      });

      it("saves while the deal is DRAFT, LISTED or REVIEWED, and refuses after a side exit", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ seller });
        await store.saveCard(cardFor(deal.id, 1));
        await toState(store, deal.id, "LISTED");
        await store.saveCard(cardFor(deal.id, 2));
        await toState(store, deal.id, "REVIEWED");
        await store.saveCard(cardFor(deal.id, 3));
        await store.transition(deal.id, "BLOCKED", "buyer_pal", "Buyer Pal stopped the deal.");
        await expect(store.saveCard(cardFor(deal.id, 4))).rejects.toBeInstanceOf(CardNotEditableError);
        await expect(store.lockCard(deal.id, 3)).rejects.toBeInstanceOf(CardNotEditableError);
        expect((await store.getDeal(deal.id))?.currentCardVersion).toBe(3);
        expect((await store.getDeal(deal.id))?.lockedCardVersion).toBeNull();
        expect((await store.getCard(deal.id, 3))?.lockedAt).toBeNull();
      });

      it("refuses to lock before the review and after AGREED, but allows it at REVIEWED and AGREED", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ seller });
        await store.saveCard(cardFor(deal.id, 1));
        await expect(store.lockCard(deal.id, 1)).rejects.toBeInstanceOf(CardNotEditableError);
        await toState(store, deal.id, "LISTED");
        await expect(store.lockCard(deal.id, 1)).rejects.toBeInstanceOf(CardNotEditableError);
        await toState(store, deal.id, "REVIEWED");
        expect((await store.lockCard(deal.id, 1)).lockedAt).not.toBeNull();

        // A caller that transitions to AGREED first may still lock there.
        const other = await store.createDeal({ seller });
        await store.saveCard(cardFor(other.id, 1));
        await toState(store, other.id, "AGREED");
        expect((await store.lockCard(other.id, 1)).lockedAt).not.toBeNull();
        await expect(store.saveCard(cardFor(other.id, 2))).rejects.toBeInstanceOf(CardLockedError);

        const paying = await store.createDeal({ seller });
        await store.saveCard(cardFor(paying.id, 1));
        await toState(store, paying.id, "PAYMENT_PENDING");
        await expect(store.lockCard(paying.id, 1)).rejects.toBeInstanceOf(CardNotEditableError);
      });
    });

    describe("two-sided agreement", () => {
      it("records buyer then seller in REVIEWED, one agreed event each, no lock and no transition", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ seller, buyer });
        await store.saveCard(cardFor(deal.id, 1));
        await toState(store, deal.id, "REVIEWED");
        const afterBuyer = await store.recordAgreement(deal.id, "buyer", "2026-01-02T09:00:00.000Z");
        expect(afterBuyer.buyerAgreedAt).toBe("2026-01-02T09:00:00.000Z");
        expect(afterBuyer.sellerAgreedAt).toBeNull();
        const afterSeller = await store.recordAgreement(deal.id, "seller", "2026-01-02T10:00:00.000Z");
        expect(afterSeller.buyerAgreedAt).toBe("2026-01-02T09:00:00.000Z");
        expect(afterSeller.sellerAgreedAt).toBe("2026-01-02T10:00:00.000Z");
        expect(afterSeller.state).toBe("REVIEWED");
        expect(afterSeller.lockedCardVersion).toBeNull();
        expect(await store.getDeal(deal.id)).toEqual(afterSeller);
        const agreed = (await store.listEvents(deal.id)).filter((e) => e.kind === "agreed");
        expect(agreed.map((e) => e.actor)).toEqual(["buyer", "seller"]);
        expect(agreed[0]?.summary).toBe("The buyer agreed to card version 1.");
      });

      it("allows the seller to agree while LISTED", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ seller });
        await store.saveCard(cardFor(deal.id, 1));
        await toState(store, deal.id, "LISTED");
        expect((await store.recordAgreement(deal.id, "seller")).sellerAgreedAt).not.toBeNull();
      });

      it("refuses agreement in DRAFT and in AGREED", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ seller, buyer });
        await store.saveCard(cardFor(deal.id, 1));
        await expect(store.recordAgreement(deal.id, "buyer")).rejects.toBeInstanceOf(AgreementNotAllowedError);
        await toState(store, deal.id, "AGREED");
        await expect(store.recordAgreement(deal.id, "seller")).rejects.toBeInstanceOf(AgreementNotAllowedError);
        expect((await store.listEvents(deal.id)).filter((e) => e.kind === "agreed")).toHaveLength(0);
      });

      it("is idempotent for the same side: first timestamp kept, one event", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ seller, buyer });
        await store.saveCard(cardFor(deal.id, 1));
        await toState(store, deal.id, "REVIEWED");
        const first = await store.recordAgreement(deal.id, "buyer", "2026-01-02T10:00:00.000Z");
        const second = await store.recordAgreement(deal.id, "buyer", "2026-01-02T11:00:00.000Z");
        expect(second.buyerAgreedAt).toBe(first.buyerAgreedAt);
        expect((await store.listEvents(deal.id)).filter((e) => e.kind === "agreed")).toHaveLength(1);
      });

      it("clears both agreements when a new card version is saved", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ seller, buyer });
        await store.saveCard(cardFor(deal.id, 1));
        await toState(store, deal.id, "REVIEWED");
        await store.recordAgreement(deal.id, "buyer");
        await store.recordAgreement(deal.id, "seller");
        await store.saveCard(cardFor(deal.id, 2));
        const after = (await store.getDeal(deal.id))!;
        expect(after.buyerAgreedAt).toBeNull();
        expect(after.sellerAgreedAt).toBeNull();
        expect(after.currentCardVersion).toBe(2);
        // Fresh agreement to the new version is then recorded against version 2.
        await store.recordAgreement(deal.id, "buyer");
        const agreed = (await store.listEvents(deal.id)).filter((e) => e.kind === "agreed");
        expect(agreed[agreed.length - 1]?.summary).toBe("The buyer agreed to card version 2.");
      });

      it("rejects agreement on an unknown deal", async () => {
        const store = await makeStore();
        await expect(store.recordAgreement("00000000-0000-4000-8000-000000000000", "buyer")).rejects.toBeInstanceOf(DealNotFoundError);
      });
    });

    describe("messages and timeline", () => {
      it("stores messages per channel in time order", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ seller, buyer });
        const base = Date.parse("2026-10-21T16:00:00.000Z");
        const at = (m: number) => new Date(base + m * 60_000).toISOString();
        await store.addMessage({ dealId: deal.id, channel: "deal", author: "buyer", text: "Still available?", photos: [], at: at(2) });
        await store.addMessage({ dealId: deal.id, channel: "buyer_pal", author: "buyer_pal", text: "Price looks fair.", photos: [], at: at(1) });
        const m = await store.addMessage({
          dealId: deal.id,
          channel: "deal",
          author: "seller",
          text: "Yes.",
          photos: [fx.cards[1]!.photos[2]!],
          at: at(0),
        });
        expect(m.id).toBeTruthy();
        expect((await store.listMessages(deal.id)).map((x) => x.text)).toEqual(["Yes.", "Price looks fair.", "Still available?"]);
        const shared = await store.listMessages(deal.id, "deal");
        expect(shared.map((x) => x.text)).toEqual(["Yes.", "Still available?"]);
        expect(shared[0]?.photos).toHaveLength(1);
      });

      it("appends arbitrary events and lists them in time order", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ seller });
        const e = await store.appendEvent({
          dealId: deal.id,
          kind: "deal_created",
          actor: "seller",
          summary: "Luis O. started a deal.",
          data: { source: "test" },
          at: "2026-01-01T16:00:00.000Z",
        });
        expect(e.id).toBeTruthy();
        await store.transition(deal.id, "LISTED", "system", "Listed.");
        const events = await store.listEvents(deal.id);
        expect(events.map((x) => x.kind)).toEqual(["deal_created", "state_changed"]);
        expect(events[0]?.data).toEqual({ source: "test" });
      });

      it("keeps insertion order for events and messages written in the same millisecond", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ seller, buyer });
        const at = "2026-01-01T12:00:00.000Z";
        for (let i = 0; i < 6; i++) {
          await store.appendEvent({ dealId: deal.id, kind: "card_updated", actor: "seller_pal", summary: `event ${i}`, at });
          await store.addMessage({ dealId: deal.id, channel: "deal", author: "seller", text: `message ${i}`, photos: [], at });
        }
        expect((await store.listEvents(deal.id)).map((e) => e.summary)).toEqual([0, 1, 2, 3, 4, 5].map((i) => `event ${i}`));
        expect((await store.listMessages(deal.id)).map((m) => m.text)).toEqual([0, 1, 2, 3, 4, 5].map((i) => `message ${i}`));
      });
    });

    describe("verdicts, payments, shipments, evidence", () => {
      it("stores verdicts and the latest arrival check", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ seller, buyer });
        const verdict = {
          dealId: deal.id,
          cardVersion: 1,
          overall: "go" as const,
          flags: [],
          priceCheck: fx.marketPrice,
          questionsForSeller: ["Battery health photo?"],
          palMessage: "Price is fair.",
          createdAt: "2026-10-21T16:30:00.000Z",
        };
        await store.saveVerdict(verdict);
        expect(await store.listVerdicts(deal.id)).toEqual([verdict]);
        expect(await store.getArrivalCheck(deal.id)).toBeNull();
        const check = {
          dealId: deal.id,
          cardVersion: 1,
          matches: false,
          mismatches: [{ field: "serial" as const, expected: "AH912345678", observed: "AJ204567113", explanation: "The box label shows a different serial and the box is empty." }],
          observed: { brand: "Sony", model: null, serial: "AJ204567113" },
          palMessage: "This is not the console on the card. The box arrived empty.",
          createdAt: "2026-10-26T16:00:00.000Z",
        };
        await store.saveArrivalCheck(check);
        expect(await store.getArrivalCheck(deal.id)).toEqual(check);
      });

      it("upserts the payment by order id and finds it by deal or order", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ seller, buyer });
        const rawOrder = { id: `ORDER-${deal.id}`, status: "CREATED", purchase_units: [{ custom_id: deal.id }] };
        const created = { ...fx.payment!, dealId: deal.id, paypalOrderId: `ORDER-${deal.id}`, captureId: null, status: "CREATED" as const, capturedAt: null, method: null, rawOrder };
        await store.savePayment(created);
        // Raw bodies are optional on the way in and always present (null when unknown) on the way out.
        expect(await store.getPayment(deal.id)).toEqual({ ...created, rawCapture: null });
        const rawCapture = { id: "CAP-1", status: "COMPLETED", amount: { value: "475.00" } };
        const captured = { ...created, status: "CAPTURED" as const, captureId: "CAP-1", capturedAt: "2026-10-21T17:05:00.000Z", method: "paypal" as const, rawCapture };
        await store.savePayment(captured);
        expect(await store.getPayment(deal.id)).toEqual(captured);
        expect(await store.getPaymentByOrderId(created.paypalOrderId)).toEqual(captured);
        expect(await store.getPaymentByOrderId("nope")).toBeNull();
      });

      it("stores one shipment per deal and updates delivery", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ seller, buyer });
        const shipped = { ...fx.shipment!, dealId: deal.id, deliveredAt: null };
        await store.saveShipment(shipped);
        expect(await store.getShipment(deal.id)).toEqual(shipped);
        const delivered = { ...shipped, deliveredAt: "2026-10-26T16:00:00.000Z" };
        await store.saveShipment(delivered);
        expect(await store.getShipment(deal.id)).toEqual(delivered);
      });

      it("stores the evidence pack", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ seller, buyer });
        expect(await store.getEvidence(deal.id)).toBeNull();
        const pack = {
          dealId: deal.id,
          builtBy: "buyer_pal" as const,
          builtAt: "2026-10-26T16:30:00.000Z",
          lockedCard: { ...fx.cards[1]!, dealId: deal.id },
          verdicts: [],
          arrivalCheck: null,
          messages: [],
          photos: [],
          payment: null,
          shipment: null,
          timeline: [],
          summary: "The watch that arrived does not match the locked card.",
        };
        await store.saveEvidence(pack);
        expect(await store.getEvidence(deal.id)).toEqual(pack);
      });
    });

    describe("webhook receipts", () => {
      it("claims an event id once and can release the claim", async () => {
        const store = await makeStore();
        const id = `WH-${crypto.randomUUID()}`;
        expect(await store.hasWebhookReceipt(id)).toBe(false);
        expect(await store.recordWebhookReceipt(id, "PAYMENT.CAPTURE.COMPLETED")).toBe(true);
        expect(await store.recordWebhookReceipt(id, "PAYMENT.CAPTURE.COMPLETED")).toBe(false);
        expect(await store.hasWebhookReceipt(id)).toBe(true);
        await store.releaseWebhookReceipt(id);
        expect(await store.hasWebhookReceipt(id)).toBe(false);
        expect(await store.recordWebhookReceipt(id, "PAYMENT.CAPTURE.COMPLETED")).toBe(true);
      });
    });
  });
}
