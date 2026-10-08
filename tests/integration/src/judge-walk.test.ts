/**
 * Judge walk, Oct 8, PLAN item J12: the structural checks behind J2, J5 and
 * J6. The wording guards for J2, J3 and J4 live in review-oct7-pal-wording,
 * the seed stamp (J7) in review-oct7-seeded-timeline, the page checks (J6,
 * J8) in tests/e2e.
 */
import { describe, expect, it } from "vitest";
import { DEAL_STATES, chainEvents, cleanPs5, fakeSlab } from "@pay-pals/contracts";
import type { DealEvent, ItemCard, PaymentRecord } from "@pay-pals/contracts";
import { createBuyerPal, createFixtureCertLookup, createFixturePriceLookup } from "@pay-pals/agents";
import { allowedActions } from "@/lib/deal/actions";
import { isExampleDeal } from "@/lib/deal/snapshot";
import { SEED_VERSION } from "@/lib/demo/seed-version";

const buyerPal = createBuyerPal({ anthropic: null, priceLookup: createFixturePriceLookup(), certLookup: createFixtureCertLookup() });

describe("J2: cert check honesty with the fixture provider", () => {
  it("an unknown cert is not checked, never a stop, and the words say so", async () => {
    const card: ItemCard = { ...fakeSlab.cards[0]!, certNumber: "99999999" };
    const { data: verdict, palMessage } = await buyerPal.review(card, [], { dealId: card.dealId, seller: fakeSlab.seller, sellerJoined: true });

    expect(verdict.flags.map((f) => f.code)).not.toContain("CERT_MISMATCH");
    expect(verdict.overall).not.toBe("stop");
    const words = [palMessage, verdict.palMessage, verdict.certCheck?.explanation ?? "", ...verdict.flags.map((f) => `${f.explanation} ${f.evidence}`)].join(" ");
    expect(words).toMatch(/not checked against PSA/i);
    expect(words).not.toMatch(/PSA's own database|we checked PSA/i);
    if (verdict.certCheck) {
      expect(verdict.certCheck.record.provider).toBe("fixture");
      expect(verdict.certCheck.matches).not.toBe(false);
    }
  });

  it("the fake slab, whose cert the fixture record contradicts, still stops on CERT_MISMATCH", async () => {
    const card = fakeSlab.cards[0]!;
    const { data: verdict } = await buyerPal.review(card, fakeSlab.chat, { dealId: card.dealId, seller: fakeSlab.seller, sellerJoined: true });
    expect(verdict.overall).toBe("stop");
    expect(verdict.flags.map((f) => f.code)).toContain("CERT_MISMATCH");
    expect(verdict.certCheck?.matches).toBe(false);
  });
});

describe("J5: agree is a REVIEWED move only", () => {
  it("PAYMENT_PENDING offers no agree action for either role", () => {
    for (const role of ["buyer", "seller"] as const) {
      expect(allowedActions("PAYMENT_PENDING", role).map((a) => a.id), role).not.toContain("agree");
      expect(allowedActions("AGREED", role).map((a) => a.id), role).not.toContain("agree");
      expect(allowedActions("REVIEWED", role).map((a) => a.id), role).toContain("agree");
    }
  });

  it("no state other than REVIEWED offers agree", () => {
    for (const state of DEAL_STATES) {
      for (const role of ["buyer", "seller"] as const) {
        const offers = allowedActions(state, role).some((a) => a.id === "agree");
        expect(offers, `${state} ${role}`).toBe(state === "REVIEWED");
      }
    }
  });
});

describe("J6: a seeded example deal is told apart from a real one", () => {
  const base = cleanPs5.timeline;
  const payment = (paypalOrderId: string): PaymentRecord => ({ ...cleanPs5.payment!, paypalOrderId });
  const stamped = (): DealEvent[] =>
    chainEvents(base.map((e) => (e.kind === "deal_created" ? { ...e, data: { seedVersion: SEED_VERSION, scenario: cleanPs5.id } } : e)));

  it("a FIXTURE- order id marks an example deal", () => {
    expect(isExampleDeal(base, payment("FIXTURE-ORDER-CLEAN-0001"))).toBe(true);
  });

  it("a seed stamp on deal_created marks an example deal even without a payment", () => {
    expect(isExampleDeal(stamped(), null)).toBe(true);
  });

  it("a real deal with a sandbox or demo order id and no seed stamp is not an example", () => {
    expect(isExampleDeal(base, payment("5O190127TN364715T"))).toBe(false);
    expect(isExampleDeal(base, payment("DEMO-1A2B3C4D"))).toBe(false);
    expect(isExampleDeal(base, null)).toBe(false);
  });
});
