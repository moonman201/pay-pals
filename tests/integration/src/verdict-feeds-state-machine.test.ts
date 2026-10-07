/**
 * The Buyer Pal's verdict decides where the deal goes next, and the store
 * holds the line afterwards. Scam fixture: a payment-method flag means the
 * deal is BLOCKED and nothing can reopen it. Clean fixture: go, AGREED, card
 * locked, no further edits.
 */
import { describe, expect, it } from "vitest";
import { CLEAN_SERIAL, IllegalTransitionError, PAYMENT_METHOD_FLAGS, canTransition, cleanPs5, hasStop, isPaymentMethodFlag, scamPs5 } from "@pay-pals/contracts";
import type { Verdict } from "@pay-pals/contracts";
import { createBuyerPal, createFixturePriceLookup } from "@pay-pals/agents";
import { AgreementNotAllowedError, CardLockedError, CardNotEditableError } from "@pay-pals/db";
import { driveTo, seedFixture } from "./seed";
import type { SeededDeal } from "./seed";

const buyerPal = createBuyerPal({ anthropic: null, priceLookup: createFixturePriceLookup() });

/** Review the current card against the saved chat, save the verdict, and move LISTED -> REVIEWED. */
async function reviewAndSave(seeded: SeededDeal): Promise<Verdict> {
  const { store, dealId, fixture } = seeded;
  const card = (await store.getCurrentCard(dealId))!;
  const chat = await store.listMessages(dealId, "deal");
  const { data: verdict } = await buyerPal.review(card, chat, { seller: fixture.seller });
  await store.saveVerdict(verdict);
  await store.transition(dealId, "LISTED", "system", "Listed.");
  await store.transition(dealId, "REVIEWED", "system", "Reviewed.");
  return verdict;
}

describe("scam-ps5: a payment-method flag blocks the deal", () => {
  it("raises every required flag, says stop, and the verdict is read back from the store", async () => {
    const seeded = await seedFixture(scamPs5);
    const verdict = await reviewAndSave(seeded);

    expect(verdict.overall).toBe("stop");
    const codes = verdict.flags.map((f) => f.code);
    for (const required of scamPs5.expectedVerdict.requiredFlags) expect(codes).toContain(required);
    expect(hasStop(verdict.flags)).toBe(true);
    expect(verdict.flags.some(isPaymentMethodFlag)).toBe(true);

    const saved = await seeded.store.listVerdicts(seeded.dealId);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.dealId).toBe(seeded.dealId);
    expect(saved[0]!.cardVersion).toBe(1);
    expect(saved[0]!.flags.filter(isPaymentMethodFlag).map((f) => f.code)).toEqual(
      verdict.flags.filter(isPaymentMethodFlag).map((f) => f.code),
    );
  });

  it("moves REVIEWED -> BLOCKED and then refuses AGREED and PAYMENT_PENDING", async () => {
    const seeded = await seedFixture(scamPs5);
    const verdict = await reviewAndSave(seeded);
    const { store, dealId } = seeded;

    const paymentFlag = verdict.flags.find(isPaymentMethodFlag)!;
    expect(PAYMENT_METHOD_FLAGS).toContain(paymentFlag.code);
    expect(canTransition("REVIEWED", "BLOCKED")).toBe(true);
    const blocked = await store.transition(dealId, "BLOCKED", "buyer_pal", paymentFlag.explanation);
    expect(blocked.state).toBe("BLOCKED");

    await expect(store.transition(dealId, "AGREED", "buyer", "Agreed.")).rejects.toBeInstanceOf(IllegalTransitionError);
    await expect(store.transition(dealId, "PAYMENT_PENDING", "system", "Payment pending.")).rejects.toBeInstanceOf(IllegalTransitionError);
    expect((await store.getDeal(dealId))!.state).toBe("BLOCKED");

    const events = await store.listEvents(dealId);
    const changes = events.filter((e) => e.kind === "state_changed").map((e) => `${e.fromState}->${e.toState}`);
    expect(changes).toEqual(["DRAFT->LISTED", "LISTED->REVIEWED", "REVIEWED->BLOCKED"]);
  });

  it("refuses to lock the card on a BLOCKED deal", async () => {
    const seeded = await seedFixture(scamPs5);
    await reviewAndSave(seeded);
    await seeded.store.transition(seeded.dealId, "BLOCKED", "buyer_pal", "Blocked.");

    await expect(seeded.store.lockCard(seeded.dealId, 1)).rejects.toBeInstanceOf(CardNotEditableError);
    const deal = (await seeded.store.getDeal(seeded.dealId))!;
    expect(deal.state).toBe("BLOCKED");
    expect(deal.currentCardVersion).toBe(1);
    expect(deal.lockedCardVersion).toBeNull();
    expect((await seeded.store.getCard(seeded.dealId, 1))!.lockedAt).toBeNull();
  });

  it("refuses a new card version on a BLOCKED deal", async () => {
    const seeded = await seedFixture(scamPs5);
    await reviewAndSave(seeded);
    await seeded.store.transition(seeded.dealId, "BLOCKED", "buyer_pal", "Blocked.");
    const current = (await seeded.store.getCurrentCard(seeded.dealId))!;

    await expect(seeded.store.saveCard({ ...current, version: 2, serial: "ZZ000000000" })).rejects.toBeInstanceOf(CardNotEditableError);
    const deal = (await seeded.store.getDeal(seeded.dealId))!;
    expect(deal.currentCardVersion).toBe(1);
    expect(deal.lockedCardVersion).toBeNull();
    expect((await seeded.store.listCards(seeded.dealId)).map((c) => c.version)).toEqual([1]);
  });
});

describe("clean-ps5: go ends AGREED with the card locked", () => {
  it("says go with no stop flag and the deal reaches AGREED", async () => {
    const seeded = await seedFixture(cleanPs5);
    const verdict = await reviewAndSave(seeded);
    const { store, dealId } = seeded;

    expect(verdict.overall).not.toBe("stop");
    expect(hasStop(verdict.flags)).toBe(false);
    expect(verdict.flags.some(isPaymentMethodFlag)).toBe(false);
    expect(verdict.cardVersion).toBe(cleanPs5.cards.length);
    expect(verdict.priceCheck).not.toBeNull();
    expect(cleanPs5.cards.at(-1)!.askingPrice).toBeGreaterThanOrEqual(verdict.priceCheck!.marketLow);
    expect(cleanPs5.cards.at(-1)!.askingPrice).toBeLessThanOrEqual(verdict.priceCheck!.marketHigh);

    const agreed = await store.transition(dealId, "AGREED", "buyer", "Both sides agreed.");
    expect(agreed.state).toBe("AGREED");
  });

  it("locks the current card at AGREED and refuses every later card change", async () => {
    const seeded = await seedFixture(cleanPs5);
    await reviewAndSave(seeded);
    const { store, dealId } = seeded;
    await store.transition(dealId, "AGREED", "buyer", "Both sides agreed.");

    const current = (await store.getCurrentCard(dealId))!;
    expect(current.version).toBe(2);
    expect(current.lockedAt).toBeNull();

    const locked = await store.lockCard(dealId, current.version);
    expect(locked.lockedAt).not.toBeNull();
    expect(locked.version).toBe(2);
    expect(locked.serial).toBe(cleanPs5.cards[1]!.serial);

    const deal = (await store.getDeal(dealId))!;
    expect(deal.lockedCardVersion).toBe(2);
    expect((await store.getCard(dealId, 2))!.lockedAt).toBe(locked.lockedAt);

    await expect(store.saveCard({ ...current, version: 3, conditionNotes: "Changed after agreement." })).rejects.toBeInstanceOf(CardLockedError);
    await expect(store.lockCard(dealId, 1)).rejects.toBeInstanceOf(CardLockedError);
    expect((await store.listCards(dealId)).map((c) => c.version)).toEqual([1, 2]);
  });

  it("keeps the box serial equal to the console serial through the store, on every version and after the lock", async () => {
    for (const fixtureCard of cleanPs5.cards) {
      expect(fixtureCard.boxSerial).toBe(fixtureCard.serial);
      expect(fixtureCard.serial).toBe(CLEAN_SERIAL);
    }

    const seeded = await seedFixture(cleanPs5);
    const { store, dealId } = seeded;
    for (const stored of seeded.cards) {
      expect(stored.boxSerial).toBe(CLEAN_SERIAL);
      expect((await store.getCard(dealId, stored.version))!.boxSerial).toBe(CLEAN_SERIAL);
    }

    await reviewAndSave(seeded);
    await store.transition(dealId, "AGREED", "buyer", "Both sides agreed.");
    const locked = await store.lockCard(dealId, cleanPs5.cards.length);
    expect(locked.boxSerial).toBe(locked.serial);
    expect(locked.boxSerial).toBe(CLEAN_SERIAL);
    expect((await store.getCurrentCard(dealId))!.boxSerial).toBe(CLEAN_SERIAL);
  });
});

describe("two-sided agreement in the store (contracts v1.3.0)", () => {
  it("records buyer then seller in REVIEWED without moving the deal, and a new card version clears both", async () => {
    const seeded = await seedFixture(cleanPs5);
    await driveTo(seeded, "REVIEWED");
    const { store, dealId } = seeded;
    const version = (await store.getDeal(dealId))!.currentCardVersion;

    const afterBuyer = await store.recordAgreement(dealId, "buyer");
    expect(afterBuyer.state).toBe("REVIEWED");
    expect(afterBuyer.buyerAgreedAt).not.toBeNull();
    expect(afterBuyer.sellerAgreedAt).toBeNull();

    const afterSeller = await store.recordAgreement(dealId, "seller");
    expect(afterSeller.state).toBe("REVIEWED");
    expect(afterSeller.buyerAgreedAt).toBe(afterBuyer.buyerAgreedAt);
    expect(afterSeller.sellerAgreedAt).not.toBeNull();
    expect(afterSeller.lockedCardVersion).toBeNull();

    // Agreeing twice is a no-op: no second timestamp, no second event.
    const again = await store.recordAgreement(dealId, "buyer");
    expect(again.buyerAgreedAt).toBe(afterBuyer.buyerAgreedAt);

    const agreed = (await store.listEvents(dealId)).filter((e) => e.kind === "agreed");
    expect(agreed.map((e) => e.actor)).toEqual(["buyer", "seller"]);
    expect(agreed.map((e) => e.summary)).toEqual([`The buyer agreed to card version ${version}.`, `The seller agreed to card version ${version}.`]);
    for (const e of agreed) expect(e.data).toMatchObject({ cardVersion: version });

    const current = (await store.getCurrentCard(dealId))!;
    await store.saveCard({ ...current, version: version + 1, conditionNotes: `${current.conditionNotes} Strap replaced last month.` });
    const afterChange = (await store.getDeal(dealId))!;
    expect(afterChange.state).toBe("REVIEWED");
    expect(afterChange.currentCardVersion).toBe(version + 1);
    expect(afterChange.buyerAgreedAt).toBeNull();
    expect(afterChange.sellerAgreedAt).toBeNull();

    // Both sides agree again to the new version; the events name it.
    await store.recordAgreement(dealId, "seller");
    const reagreed = await store.recordAgreement(dealId, "buyer");
    expect(reagreed.buyerAgreedAt).not.toBeNull();
    expect(reagreed.sellerAgreedAt).not.toBeNull();
    const all = (await store.listEvents(dealId)).filter((e) => e.kind === "agreed");
    expect(all).toHaveLength(4);
    expect(all.slice(2).map((e) => e.data?.cardVersion)).toEqual([version + 1, version + 1]);
  });

  it("refuses agreement once the card is locked and the deal is AGREED", async () => {
    const seeded = await seedFixture(cleanPs5);
    await driveTo(seeded, "REVIEWED");
    const { store, dealId } = seeded;
    await store.recordAgreement(dealId, "buyer");
    await store.recordAgreement(dealId, "seller");
    const version = (await store.getDeal(dealId))!.currentCardVersion;
    await store.lockCard(dealId, version);
    await store.transition(dealId, "AGREED", "seller", "Agreed.");

    await expect(store.recordAgreement(dealId, "buyer")).rejects.toBeInstanceOf(AgreementNotAllowedError);
    const deal = (await store.getDeal(dealId))!;
    expect(deal.state).toBe("AGREED");
    expect(deal.lockedCardVersion).toBe(version);
    expect((await store.listEvents(dealId)).filter((e) => e.kind === "agreed")).toHaveLength(2);
  });
});
