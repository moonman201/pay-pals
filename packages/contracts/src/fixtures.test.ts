import { describe, expect, it } from "vitest";
import { ALL_FIXTURES, FIXTURES, getFixture } from "./fixtures";
import { DealSchema } from "./deal";
import { ItemCardSchema } from "./item-card";
import { DealEventSchema, MessageSchema } from "./messages";
import { PriceCheckSchema } from "./verdict";
import { PaymentRecordSchema } from "./payment";
import { ShipmentSchema } from "./shipping";
import { canTransition } from "./deal-state";

describe("scenario fixtures", () => {
  it("ships all three scenarios", () => {
    expect(Object.keys(FIXTURES).sort()).toEqual(["clean-garmin", "scam-garmin", "wrong-item"]);
    expect(getFixture("scam-garmin").id).toBe("scam-garmin");
  });

  for (const fx of ALL_FIXTURES) {
    describe(fx.id, () => {
      it("parses against the contract schemas", () => {
        expect(DealSchema.parse(fx.deal)).toBeTruthy();
        for (const card of fx.cards) ItemCardSchema.parse(card);
        for (const m of fx.chat) MessageSchema.parse(m);
        for (const e of fx.timeline) DealEventSchema.parse(e);
        PriceCheckSchema.parse(fx.marketPrice);
        if (fx.payment) PaymentRecordSchema.parse(fx.payment);
        if (fx.shipment) ShipmentSchema.parse(fx.shipment);
      });

      it("keeps ids and versions consistent", () => {
        for (const card of fx.cards) expect(card.dealId).toBe(fx.deal.id);
        expect(fx.cards.map((c) => c.version)).toEqual(fx.cards.map((_, i) => i + 1));
        expect(fx.deal.currentCardVersion).toBe(fx.cards.length);
        if (fx.deal.lockedCardVersion) {
          expect(fx.cards[fx.deal.lockedCardVersion - 1]!.lockedAt).not.toBeNull();
        } else {
          for (const card of fx.cards) expect(card.lockedAt).toBeNull();
        }
      });

      it("has a timeline whose state changes are legal and end at the deal state", () => {
        const changes = fx.timeline.filter((e) => e.kind === "state_changed");
        let state: string = "DRAFT";
        for (const c of changes) {
          expect(c.fromState).toBe(state);
          expect(canTransition(c.fromState!, c.toState!)).toBe(true);
          state = c.toState!;
        }
        expect(state).toBe(fx.deal.state);
      });

      it("locks the card only after both sides agreed", () => {
        const bothAgreed = fx.deal.buyerAgreedAt !== null && fx.deal.sellerAgreedAt !== null;
        expect(fx.deal.lockedCardVersion !== null).toBe(bothAgreed);
        if (bothAgreed) {
          const agreed = fx.timeline.filter((e) => e.kind === "agreed").map((e) => e.actor).sort();
          expect(agreed).toEqual(["buyer", "seller"]);
        }
      });

      it("is in time order", () => {
        const times = fx.timeline.map((e) => Date.parse(e.at));
        expect([...times].sort((a, b) => a - b)).toEqual(times);
      });
    });
  }

  it("scam scenario expects the three required flags and a stop", () => {
    const v = FIXTURES["scam-garmin"].expectedVerdict;
    expect(v.overall).toBe("stop");
    expect(v.requiredFlags).toEqual(
      expect.arrayContaining(["FRIENDS_AND_FAMILY_REQUEST", "PRICE_FAR_BELOW_MARKET", "URGENCY_PRESSURE"]),
    );
  });

  it("wrong item scenario locks one serial and receives another", () => {
    const fx = FIXTURES["wrong-item"];
    const lockedSerial = fx.cards[0]!.serial!;
    expect(fx.arrivalPhotos.some((p) => p.whatItShows.includes(lockedSerial))).toBe(false);
    expect(fx.expectedArrival?.matches).toBe(false);
    expect(fx.expectedArrival?.mismatchFields).toContain("serial");
  });
});
