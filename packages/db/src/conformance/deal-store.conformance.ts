/**
 * One behavior suite, run against every DealStore implementation, so the
 * memory store and the Postgres store cannot drift. Each implementation's
 * test file calls runDealStoreConformance with a factory.
 */
import { describe, expect, it } from "vitest";
import { IllegalTransitionError, getFixture, verifyChain } from "@pay-pals/contracts";
import type { ItemCard, Party } from "@pay-pals/contracts";
import { createReplayClock, type StoreOptions } from "../clock";
import {
  AgreementNotAllowedError,
  CardLockedError,
  CardNotEditableError,
  CardVersionError,
  DealNotFoundError,
  EventOutOfOrderError,
  SellerJoinNotAllowedError,
} from "../errors";
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

export type StoreFactory = (options?: StoreOptions) => Promise<PayPalsStore>;

export function runDealStoreConformance(name: string, makeStore: StoreFactory) {
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
        const deal = await store.createDeal({ startedBy: "seller", seller, scenario: "clean-ps5" });
        expect(deal.state).toBe("DRAFT");
        expect(deal.currentCardVersion).toBe(0);
        expect(deal.lockedCardVersion).toBeNull();
        expect(deal.buyerAgreedAt).toBeNull();
        expect(deal.sellerAgreedAt).toBeNull();
        expect(deal.buyer).toBeNull();
        expect(deal.scenario).toBe("clean-ps5");
        expect(await store.getDeal(deal.id)).toEqual(deal);
      });

      it("creates a buyer-started deal with the listing link and no seller join yet", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({
          startedBy: "buyer",
          seller: { role: "seller", displayName: "matt", email: "matt@example.com" },
          buyer,
          listingUrl: "https://marketplace.example.com/listing/123",
        });
        expect(deal).toMatchObject({ startedBy: "buyer", listingUrl: "https://marketplace.example.com/listing/123", sellerJoinedAt: null });
        expect(await store.getDeal(deal.id)).toEqual(deal);
        const sellerStarted = await store.createDeal({ startedBy: "seller", seller });
        expect(sellerStarted).toMatchObject({ startedBy: "seller", listingUrl: null, sellerJoinedAt: null });
      });

      it("returns null for an unknown deal", async () => {
        const store = await makeStore();
        expect(await store.getDeal("00000000-0000-4000-8000-000000000000")).toBeNull();
      });

      it("sets the buyer when they open the link", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ startedBy: "seller", seller });
        const updated = await store.setBuyer(deal.id, buyer);
        expect(updated.buyer).toEqual(buyer);
        expect((await store.getDeal(deal.id))?.buyer).toEqual(buyer);
      });

      it("finds deals by scenario and state, oldest first", async () => {
        const store = await makeStore();
        const pause = () => new Promise((r) => setTimeout(r, 3));
        const a = await store.createDeal({ startedBy: "seller", seller, scenario: "clean-ps5" });
        await pause();
        const b = await store.createDeal({ startedBy: "seller", seller, scenario: "clean-ps5" });
        await pause();
        const c = await store.createDeal({ startedBy: "seller", seller, scenario: "fake-slab" });
        await pause();
        const none = await store.createDeal({ startedBy: "seller", seller });
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
        expect(await find({ scenario: "fake-slab", states: ["COMPLETE"] })).toEqual([]);
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
        const deal = await store.createDeal({ startedBy: "seller", seller, buyer });
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
        const deal = await store.createDeal({ startedBy: "seller", seller });
        await expect(store.transition(deal.id, "PAID", "system", "skip ahead")).rejects.toBeInstanceOf(IllegalTransitionError);
        expect((await store.getDeal(deal.id))?.state).toBe("DRAFT");
        expect(await store.listEvents(deal.id)).toHaveLength(0);
      });

      it("rejects BLOCKED from anywhere but REVIEWED and ISSUE from anywhere but DELIVERED", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ startedBy: "seller", seller });
        await store.transition(deal.id, "LISTED", "system", "Listed.");
        await expect(store.transition(deal.id, "BLOCKED", "buyer_pal", "stop")).rejects.toBeInstanceOf(IllegalTransitionError);
        await expect(store.transition(deal.id, "ISSUE", "buyer_pal", "stop")).rejects.toBeInstanceOf(IllegalTransitionError);
        await store.transition(deal.id, "REVIEWED", "system", "Reviewed.");
        const blocked = await store.transition(deal.id, "BLOCKED", "buyer_pal", "Buyer Pal stopped the deal.");
        expect(blocked.state).toBe("BLOCKED");
      });

      it("walks the buyer-started path DRAFT -> INVITED -> LISTED", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ startedBy: "buyer", seller, buyer });
        expect((await store.transition(deal.id, "INVITED", "system", "Invite sent.")).state).toBe("INVITED");
        expect((await store.transition(deal.id, "LISTED", "system", "Listed.")).state).toBe("LISTED");
      });

      it("lets a refusal be reviewed from INVITED and blocked", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ startedBy: "buyer", seller, buyer });
        await store.transition(deal.id, "INVITED", "system", "Invite sent.");
        await expect(store.transition(deal.id, "AGREED", "system", "skip")).rejects.toBeInstanceOf(IllegalTransitionError);
        expect((await store.transition(deal.id, "REVIEWED", "buyer_pal", "Reviewed the refusal.")).state).toBe("REVIEWED");
        expect((await store.transition(deal.id, "BLOCKED", "buyer_pal", "The seller refused Pay Pals.")).state).toBe("BLOCKED");
      });

      it("never leaves a terminal state", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ startedBy: "seller", seller });
        await store.transition(deal.id, "CANCELLED", "seller", "Changed my mind.");
        await expect(store.transition(deal.id, "DRAFT", "seller", "undo")).rejects.toBeInstanceOf(IllegalTransitionError);
        await expect(store.transition(deal.id, "LISTED", "seller", "undo")).rejects.toBeInstanceOf(IllegalTransitionError);
      });

      it("rejects cancelling once money has moved", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ startedBy: "seller", seller, buyer });
        for (const next of ["LISTED", "REVIEWED", "AGREED", "PAYMENT_PENDING", "PAID"] as const) {
          await store.transition(deal.id, next, "system", next);
        }
        await expect(store.transition(deal.id, "CANCELLED", "buyer", "refund me")).rejects.toBeInstanceOf(IllegalTransitionError);
      });
    });

    describe("item cards", () => {
      it("saves versions in order and tracks the current version on the deal", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ startedBy: "seller", seller });
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
        const deal = await store.createDeal({ startedBy: "seller", seller });
        const saved = await store.saveCard(cardFor(deal.id, 1, { askingPrice: 475.5 }));
        expect(saved.askingPrice).toBe(475.5);
        expect((await store.getCard(deal.id, 1))?.askingPrice).toBe(475.5);
      });

      it("round-trips boxSerial, certNumber and grade, present or absent", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ startedBy: "seller", seller });
        const slab = await store.saveCard(cardFor(deal.id, 1, { serial: null, boxSerial: null, certNumber: "12345678", grade: "PSA 10" }));
        expect(slab).toMatchObject({ serial: null, boxSerial: null, certNumber: "12345678", grade: "PSA 10" });
        expect(await store.getCard(deal.id, 1)).toEqual(slab);
        const ps5 = await store.saveCard(cardFor(deal.id, 2, { boxSerial: "AH912345678", certNumber: null, grade: null }));
        expect((await store.getCard(deal.id, 2))?.boxSerial).toBe("AH912345678");
        expect(await store.getCurrentCard(deal.id)).toEqual(ps5);
      });

      it("accepts a card while INVITED", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ startedBy: "buyer", seller, buyer });
        await store.transition(deal.id, "INVITED", "system", "Invite sent.");
        expect((await store.saveCard(cardFor(deal.id, 1))).version).toBe(1);
      });

      it("rejects a version that is not the next one", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ startedBy: "seller", seller });
        await expect(store.saveCard(cardFor(deal.id, 2))).rejects.toBeInstanceOf(CardVersionError);
        await store.saveCard(cardFor(deal.id, 1));
        await expect(store.saveCard(cardFor(deal.id, 1))).rejects.toBeInstanceOf(CardVersionError);
      });

      it("locks the current version at REVIEWED and then refuses new versions", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ startedBy: "seller", seller });
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
        const deal = await store.createDeal({ startedBy: "seller", seller });
        await store.saveCard(cardFor(deal.id, 1));
        await store.saveCard(cardFor(deal.id, 2));
        await toState(store, deal.id, "REVIEWED");
        await expect(store.lockCard(deal.id, 1)).rejects.toBeInstanceOf(CardVersionError);
        expect((await store.getDeal(deal.id))?.lockedCardVersion).toBeNull();
        expect((await store.lockCard(deal.id, 2)).version).toBe(2);
      });

      it("saves while the deal is DRAFT, LISTED or REVIEWED, and refuses after a side exit", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ startedBy: "seller", seller });
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
        const deal = await store.createDeal({ startedBy: "seller", seller });
        await store.saveCard(cardFor(deal.id, 1));
        await expect(store.lockCard(deal.id, 1)).rejects.toBeInstanceOf(CardNotEditableError);
        await toState(store, deal.id, "LISTED");
        await expect(store.lockCard(deal.id, 1)).rejects.toBeInstanceOf(CardNotEditableError);
        await toState(store, deal.id, "REVIEWED");
        expect((await store.lockCard(deal.id, 1)).lockedAt).not.toBeNull();

        // A caller that transitions to AGREED first may still lock there.
        const other = await store.createDeal({ startedBy: "seller", seller });
        await store.saveCard(cardFor(other.id, 1));
        await toState(store, other.id, "AGREED");
        expect((await store.lockCard(other.id, 1)).lockedAt).not.toBeNull();
        await expect(store.saveCard(cardFor(other.id, 2))).rejects.toBeInstanceOf(CardLockedError);

        const paying = await store.createDeal({ startedBy: "seller", seller });
        await store.saveCard(cardFor(paying.id, 1));
        await toState(store, paying.id, "PAYMENT_PENDING");
        await expect(store.lockCard(paying.id, 1)).rejects.toBeInstanceOf(CardNotEditableError);
      });
    });

    describe("hash chain", () => {
      it("chains every event over a full happy path and verifies", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ startedBy: "seller", seller, buyer });
        await store.appendEvent({ dealId: deal.id, kind: "deal_created", actor: "seller", summary: "Started.", at: "2026-01-01T10:00:00.000Z" });
        await store.saveCard(cardFor(deal.id, 1));
        await store.transition(deal.id, "LISTED", "system", "Listed.");
        await store.transition(deal.id, "REVIEWED", "system", "Reviewed.");
        await store.recordAgreement(deal.id, "buyer");
        await store.recordAgreement(deal.id, "seller");
        await store.lockCard(deal.id, 1);
        for (const next of ["AGREED", "PAYMENT_PENDING", "PAID", "SHIPPED", "DELIVERED", "COMPLETE"] as const) {
          await store.transition(deal.id, next, "system", `${next}.`);
        }
        const events = await store.listEvents(deal.id);
        expect(events).toHaveLength(11);
        expect(events[0]?.prevHash).toBeNull();
        for (let i = 1; i < events.length; i++) expect(events[i]?.prevHash).toBe(events[i - 1]?.hash);
        expect(new Set(events.map((e) => e.hash)).size).toBe(events.length);
        const check = verifyChain(events);
        expect(check).toEqual({ ok: true, head: events[events.length - 1]?.hash, brokenAt: null });
        // Callers never supply hashes; the store's are the real ones.
        for (const e of events) expect(e.hash).toMatch(/^[0-9a-f]{64}$/);
      });

      it("keeps one linear chain under concurrent appends", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ startedBy: "seller", seller });
        const at = "2026-01-01T10:00:00.000Z";
        const appended = await Promise.all(
          [0, 1, 2, 3, 4, 5].map((i) =>
            store.appendEvent({ dealId: deal.id, kind: "card_updated", actor: "seller_pal", summary: `event ${i}`, at }),
          ),
        );
        const events = await store.listEvents(deal.id);
        expect(events).toHaveLength(6);
        expect(verifyChain(events).ok).toBe(true);
        expect(new Set(appended.map((e) => e.hash)).size).toBe(6);
        expect(events.map((e) => e.hash).sort()).toEqual(appended.map((e) => e.hash).sort());
      });

      it("a tampered summary no longer verifies", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ startedBy: "seller", seller });
        await store.transition(deal.id, "LISTED", "system", "Listed.");
        await store.transition(deal.id, "REVIEWED", "system", "Reviewed.");
        const events = await store.listEvents(deal.id);
        const tampered = [{ ...events[0]!, summary: "Listed, honest." }, events[1]!];
        expect(verifyChain(tampered)).toMatchObject({ ok: false, brokenAt: 0 });
      });
    });

    describe("replay clock", () => {
      const T = (minutes: number) => new Date(Date.parse("2026-10-21T16:00:00.000Z") + minutes * 60_000).toISOString();

      it("stamps every store-generated time from the clock, so a seeder can replay fixture dates", async () => {
        const replay = createReplayClock(T(0));
        const store = await makeStore({ clock: replay.clock });
        const deal = await store.createDeal({ startedBy: "buyer", seller, buyer });
        expect(deal.createdAt).toBe(T(0));
        expect(deal.updatedAt).toBe(T(0));

        replay.set(T(1));
        await store.transition(deal.id, "INVITED", "system", "Invite sent.");
        replay.set(T(5));
        const joined = await store.markSellerJoined(deal.id);
        expect(joined.sellerJoinedAt).toBe(T(5));
        replay.set(T(10));
        await store.saveCard(cardFor(deal.id, 1));
        expect((await store.getDeal(deal.id))?.updatedAt).toBe(T(10));
        replay.set(T(20));
        await store.transition(deal.id, "LISTED", "system", "Listed.");
        replay.set(T(30));
        await store.transition(deal.id, "REVIEWED", "buyer_pal", "Reviewed.");
        replay.set(T(40));
        const agreedBuyer = await store.recordAgreement(deal.id, "buyer");
        expect(agreedBuyer.buyerAgreedAt).toBe(T(40));
        replay.set(T(45));
        await store.recordAgreement(deal.id, "seller");
        replay.set(T(60));
        const locked = await store.lockCard(deal.id, 1);
        expect(locked.lockedAt).toBe(T(60));
        replay.set(T(61));
        const agreed = await store.transition(deal.id, "AGREED", "system", "Agreed.");
        expect(agreed.updatedAt).toBe(T(61));

        const events = await store.listEvents(deal.id);
        expect(events.map((e) => [e.kind, e.at])).toEqual([
          ["state_changed", T(1)],
          ["seller_joined", T(5)],
          ["state_changed", T(20)],
          ["state_changed", T(30)],
          ["agreed", T(40)],
          ["agreed", T(45)],
          ["state_changed", T(61)],
        ]);
        expect(verifyChain(events).ok).toBe(true);
        // The same instant twice is fine; order falls back to the id.
        await store.appendEvent({ dealId: deal.id, kind: "payment_created", actor: "paypal", summary: "Order created.", at: T(61) });
        expect(verifyChain(await store.listEvents(deal.id)).ok).toBe(true);
      });

      it("refuses a clock that moves backwards within a deal, on the store's own events and on appendEvent", async () => {
        const replay = createReplayClock(T(10));
        const store = await makeStore({ clock: replay.clock });
        const deal = await store.createDeal({ startedBy: "seller", seller });
        await store.transition(deal.id, "LISTED", "system", "Listed.");
        replay.set(T(5));
        await expect(store.transition(deal.id, "REVIEWED", "system", "Reviewed.")).rejects.toBeInstanceOf(EventOutOfOrderError);
        expect((await store.getDeal(deal.id))?.state).toBe("LISTED");
        await expect(
          store.appendEvent({ dealId: deal.id, kind: "card_updated", actor: "seller_pal", summary: "Too early.", at: T(9) }),
        ).rejects.toBeInstanceOf(EventOutOfOrderError);
        expect(await store.listEvents(deal.id)).toHaveLength(1);
        replay.set(T(11));
        expect((await store.transition(deal.id, "REVIEWED", "system", "Reviewed.")).state).toBe("REVIEWED");
        expect(verifyChain(await store.listEvents(deal.id)).ok).toBe(true);
      });

      it("uses the wall clock when none is given", async () => {
        const store = await makeStore();
        const before = Date.now();
        const deal = await store.createDeal({ startedBy: "seller", seller });
        expect(Date.parse(deal.createdAt)).toBeGreaterThanOrEqual(before - 1000);
        expect(Date.parse(deal.createdAt)).toBeLessThanOrEqual(Date.now() + 1000);
      });
    });

    describe("seller join", () => {
      it("records the join once from INVITED, updates the seller name and appends seller_joined", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ startedBy: "buyer", seller: { role: "seller", displayName: "matt", email: "matt@example.com" }, buyer });
        await store.transition(deal.id, "INVITED", "system", "Invite sent.");
        const joined = await store.markSellerJoined(deal.id, { displayName: "Matt M." });
        expect(joined.sellerJoinedAt).not.toBeNull();
        expect(joined.seller).toEqual({ role: "seller", displayName: "Matt M.", email: "matt@example.com" });
        const again = await store.markSellerJoined(deal.id, { displayName: "Someone Else" });
        expect(again.sellerJoinedAt).toBe(joined.sellerJoinedAt);
        expect(again.seller.displayName).toBe("Matt M.");
        expect(await store.getDeal(deal.id)).toEqual(again);
        const joins = (await store.listEvents(deal.id)).filter((e) => e.kind === "seller_joined");
        expect(joins).toHaveLength(1);
        expect(joins[0]).toMatchObject({ actor: "seller", summary: "Matt M. joined the deal." });
      });

      it("is allowed later in a live deal, refused in DRAFT and after the deal ends", async () => {
        const store = await makeStore();
        const draft = await store.createDeal({ startedBy: "buyer", seller, buyer });
        await expect(store.markSellerJoined(draft.id)).rejects.toBeInstanceOf(SellerJoinNotAllowedError);
        await store.transition(draft.id, "INVITED", "system", "Invite sent.");
        await store.transition(draft.id, "LISTED", "system", "Listed.");
        expect((await store.markSellerJoined(draft.id)).sellerJoinedAt).not.toBeNull();

        const over = await store.createDeal({ startedBy: "buyer", seller, buyer });
        await store.transition(over.id, "INVITED", "system", "Invite sent.");
        await store.transition(over.id, "CANCELLED", "buyer", "Never mind.");
        await expect(store.markSellerJoined(over.id)).rejects.toBeInstanceOf(SellerJoinNotAllowedError);
        await expect(store.markSellerJoined("00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(DealNotFoundError);
      });
    });

    describe("two-sided agreement", () => {
      it("records buyer then seller in REVIEWED, one agreed event each, no lock and no transition", async () => {
        // Explicit agreement times below must not precede the deal's events, so the deal is built on a clock before them.
        const store = await makeStore({ clock: createReplayClock("2026-01-02T08:00:00.000Z").clock });
        const deal = await store.createDeal({ startedBy: "seller", seller, buyer });
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
        const deal = await store.createDeal({ startedBy: "seller", seller });
        await store.saveCard(cardFor(deal.id, 1));
        await toState(store, deal.id, "LISTED");
        expect((await store.recordAgreement(deal.id, "seller")).sellerAgreedAt).not.toBeNull();
      });

      it("refuses agreement in DRAFT and in AGREED", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ startedBy: "seller", seller, buyer });
        await store.saveCard(cardFor(deal.id, 1));
        await expect(store.recordAgreement(deal.id, "buyer")).rejects.toBeInstanceOf(AgreementNotAllowedError);
        await toState(store, deal.id, "AGREED");
        await expect(store.recordAgreement(deal.id, "seller")).rejects.toBeInstanceOf(AgreementNotAllowedError);
        expect((await store.listEvents(deal.id)).filter((e) => e.kind === "agreed")).toHaveLength(0);
      });

      it("is idempotent for the same side: first timestamp kept, one event", async () => {
        const store = await makeStore({ clock: createReplayClock("2026-01-02T08:00:00.000Z").clock });
        const deal = await store.createDeal({ startedBy: "seller", seller, buyer });
        await store.saveCard(cardFor(deal.id, 1));
        await toState(store, deal.id, "REVIEWED");
        const first = await store.recordAgreement(deal.id, "buyer", "2026-01-02T10:00:00.000Z");
        const second = await store.recordAgreement(deal.id, "buyer", "2026-01-02T11:00:00.000Z");
        expect(second.buyerAgreedAt).toBe(first.buyerAgreedAt);
        expect((await store.listEvents(deal.id)).filter((e) => e.kind === "agreed")).toHaveLength(1);
      });

      it("clears both agreements when a new card version is saved", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ startedBy: "seller", seller, buyer });
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
        const deal = await store.createDeal({ startedBy: "seller", seller, buyer });
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
        const deal = await store.createDeal({ startedBy: "seller", seller });
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
        const deal = await store.createDeal({ startedBy: "seller", seller, buyer });
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
        const deal = await store.createDeal({ startedBy: "seller", seller, buyer });
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
        const deal = await store.createDeal({ startedBy: "seller", seller, buyer });
        const rawOrder = { id: `ORDER-${deal.id}`, status: "CREATED", purchase_units: [{ custom_id: deal.id }] };
        const created = { ...fx.payment!, dealId: deal.id, paypalOrderId: `ORDER-${deal.id}`, captureId: null, status: "CREATED" as const, capturedAt: null, method: null, rawOrder };
        await store.savePayment(created);
        // Raw bodies are optional on the way in and always present (null when unknown) on the way out.
        expect(await store.getPayment(deal.id)).toEqual({ ...created, rawCapture: null, historyHash: null });
        const rawCapture = { id: "CAP-1", status: "COMPLETED", amount: { value: "475.00" } };
        const historyHash = "a".repeat(64);
        const captured = { ...created, status: "CAPTURED" as const, captureId: "CAP-1", capturedAt: "2026-10-21T17:05:00.000Z", method: "paypal" as const, rawCapture, historyHash };
        await store.savePayment(captured);
        expect(await store.getPayment(deal.id)).toEqual(captured);
        expect(await store.getPaymentByOrderId(created.paypalOrderId)).toEqual(captured);
        expect(await store.getPaymentByOrderId("nope")).toBeNull();
      });

      it("stores one shipment per deal and updates delivery", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ startedBy: "seller", seller, buyer });
        const shipped = { ...fx.shipment!, dealId: deal.id, deliveredAt: null };
        await store.saveShipment(shipped);
        expect(await store.getShipment(deal.id)).toEqual(shipped);
        const delivered = { ...shipped, deliveredAt: "2026-10-26T16:00:00.000Z" };
        await store.saveShipment(delivered);
        expect(await store.getShipment(deal.id)).toEqual(delivered);
      });

      it("stores the evidence pack", async () => {
        const store = await makeStore();
        const deal = await store.createDeal({ startedBy: "seller", seller, buyer });
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
