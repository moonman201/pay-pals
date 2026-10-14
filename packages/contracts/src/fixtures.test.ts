import { describe, expect, it } from "vitest";
import { ALL_FIXTURES, CLEAN_SERIAL, FIXTURES, getFixture } from "./fixtures";
import { DealSchema } from "./deal";
import { ItemCardSchema } from "./item-card";
import { DealEventSchema, MessageSchema } from "./messages";
import { PriceCheckSchema } from "./verdict";
import { PaymentRecordSchema } from "./payment";
import { ShipmentSchema } from "./shipping";
import { canTransition } from "./deal-state";
import { verifyChain } from "./history";

describe("scenario fixtures", () => {
  it("ships all three scenarios", () => {
    expect(Object.keys(FIXTURES).sort()).toEqual(["clean-ps5", "empty-box", "fake-slab"]);
    expect(getFixture("fake-slab").id).toBe("fake-slab");
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

      it("has a valid hash chain", () => {
        const check = verifyChain(fx.timeline);
        expect(check.ok).toBe(true);
        expect(check.head).toBe(fx.timeline[fx.timeline.length - 1]!.hash);
        expect(fx.timeline[0]!.prevHash).toBeNull();
      });

      it("buyer-started deals pass through INVITED and record the seller joining", () => {
        const invited = fx.timeline.some((e) => e.kind === "state_changed" && e.toState === "INVITED");
        expect(invited).toBe(fx.deal.startedBy === "buyer");
        if (fx.deal.startedBy === "buyer") {
          expect(fx.deal.listingUrl).not.toBeNull();
          expect(fx.timeline.some((e) => e.kind === "seller_joined")).toBe(true);
        }
      });

      it("is in time order", () => {
        const times = fx.timeline.map((e) => Date.parse(e.at));
        expect([...times].sort((a, b) => a - b)).toEqual(times);
      });
    });
  }

  it("stolen photo scenario stops on the payment demand and the pressure, not on the price or the cert", () => {
    const fx = FIXTURES["fake-slab"];
    const v = fx.expectedVerdict;
    expect(v.overall).toBe("stop");
    expect(v.requiredFlags).toEqual(
      expect.arrayContaining(["FRIENDS_AND_FAMILY_REQUEST", "URGENCY_PRESSURE"]),
    );
    // 2026-10-14: the price flag was required here; a graded card has no price check (F14).
    // The cert is real and matches the card, so CERT_MISMATCH must never be expected here.
    expect(v.requiredFlags).not.toContain("CERT_MISMATCH");
    expect(v.optionalFlags).not.toContain("CERT_MISMATCH");
    expect(fx.deal.startedBy).toBe("buyer");
    const card = fx.cards[0]!;
    expect(card.certNumber).toBe(fx.certRecord!.certNumber);
    // The grader's record describes the same card and the same grade.
    expect(fx.certRecord!.grade).toMatch(/10/);
    expect(fx.certRecord!.subject).toMatch(/GENGAR & MIMIKYU GX/i);
    // 2026-10-14: this asserted the ask sat far under a graded comp range. The
    // expectation was wrong, not the code: Pay Pals cannot price a graded card
    // (F14), so the fixture holds no range and the deal stops on other grounds.
    expect(fx.marketPrice.marketLow).toBe(0);
    expect(fx.marketPrice.sources).toHaveLength(0);
    expect(fx.expectedVerdict.requiredFlags).not.toContain("PRICE_FAR_BELOW_MARKET");
  });

  it("clean scenario starts with no readable console serial and ends with one that matches the box", () => {
    const fx = FIXTURES["clean-ps5"];
    const v1 = fx.cards[0]!;
    const v2 = fx.cards[1]!;
    // Version 1 has the box label only: a box is not the item.
    expect(v1.serial).toBeNull();
    expect(v1.boxSerial).toBe(CLEAN_SERIAL);
    // The close-up arrives in version 2 and the two agree.
    expect(v2.serial).toBe(CLEAN_SERIAL);
    expect(v2.boxSerial).toBe(CLEAN_SERIAL);
    expect(v2.photos.length).toBe(v1.photos.length + 1);
    expect(fx.arrivalPhotos.some((p) => p.whatItShows.includes(CLEAN_SERIAL))).toBe(true);
  });

  it("empty box scenario ships without the packing photo and the pal says so", () => {
    const fx = FIXTURES["empty-box"];
    expect(fx.shipment!.checklist.some((c) => c.required && !c.done)).toBe(true);
    expect(fx.shipment!.flags!.map((f) => f.code)).toContain("MISSING_PACKING_PHOTO");
    expect(fx.timeline.some((e) => e.kind === "shipment_checked")).toBe(true);
    expect(fx.chat.some((m) => m.author === "buyer_pal")).toBe(true);
  });

  it("empty box scenario arrives with no console", () => {
    const fx = FIXTURES["empty-box"];
    expect(fx.arrivalPhotos.some((p) => /foam insert/i.test(p.whatItShows))).toBe(true);
    // captions describe what is visible, never the conclusion
    for (const photo of [...fx.listingPhotos, ...fx.arrivalPhotos]) expect(photo.whatItShows).not.toMatch(/reused|no console|empty|scam|fake/i);
    expect(fx.expectedArrival?.outcome).toBe("mismatch");
    expect(fx.expectedArrival?.mismatchFields).toContain("other");
  });
});
