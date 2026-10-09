/**
 * The three demo scenarios, driven end to end through the flows on the real
 * packages with no keys: the in-memory store from @pay-pals/db, the real pals
 * from @pay-pals/agents running rules only, fixture prices, and the mock
 * PayPal gateway. This is what the deal room does when a judge clicks.
 */
import { CLEAN_SERIAL, cleanPs5, EMPTY_BOX_LOCKED_SERIAL, emptyBox, fakeSlab, historyMatchesHead } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { createServices } from "../../services";
import { loadSnapshot } from "../snapshot";
import { agree } from "./agree";
import { checkArrival } from "./arrival";
import { applyBuyerRequest } from "./card";
import { completeDeal, reportIssue } from "./close";
import { postChat } from "./chat";
import { declineInvite, sellerJoin, startBuyerFirst } from "./invite";
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

describe("fake-slab", () => {
  it("ends BLOCKED at review with payment-method flags and no order", async () => {
    const services = noKeys();
    const deal = await startDemoDeal(services, "fake-slab");
    expect(deal.state).toBe("LISTED");

    const verdict = await runReview(services, deal.id);
    expect(verdict.overall).toBe("stop");
    const codes = verdict.flags.map((f) => f.code);
    // The payment-method flag is what stops this deal, and it is the one the room must never let a buyer override.
    expect(codes).toContain("FRIENDS_AND_FAMILY_REQUEST");
    expect(codes.every((c) => fakeSlab.expectedVerdict.requiredFlags.includes(c) || fakeSlab.expectedVerdict.optionalFlags.includes(c))).toBe(true);
    // The cert on this listing is real: the card is someone else's, taken from the listing photo.
    expect(verdict.certCheck?.matches).toBe(true);
    // The reused-photo flag comes from an image match. With no photo files served, it must stay silent.
    expect(codes).not.toContain("STOCK_OR_REUSED_PHOTO");

    const snap = await loadSnapshot(services, deal.id);
    expect(snap.deal.state).toBe("BLOCKED");
    expect(snap.payment).toBeNull();
    await expect(agree(services, deal.id, "buyer", true)).rejects.toThrow();
  });
});

describe("clean-ps5", () => {
  it("seeds only the chat from before the first review, so the chat never runs ahead of card v1", async () => {
    const services = noKeys();
    const deal = await startDemoDeal(services, "clean-ps5");
    const firstReview = cleanPs5.timeline.find((e) => e.kind === "review_posted")!.at;
    const expected = cleanPs5.chat.filter((m) => m.at < firstReview);
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(cleanPs5.chat.length);
    const seeded = await services.store.listMessages(deal.id, "deal");
    expect(seeded.map((m) => m.text)).toEqual(expected.map((m) => m.text));
    expect(seeded.every((m) => m.photos.length === 0)).toBe(true);
  });

  it("runs review, a seller photo update, both agreements, pay, ship, deliver, arrival match, complete", async () => {
    const services = noKeys();
    const deal = await startDemoDeal(services, "clean-ps5");

    const v1 = await runReview(services, deal.id);
    // Version 1 has the box label but no serial read off the console itself, so the pal asks before it says go.
    expect(v1.overall).toBe("caution");
    expect(v1.flags.map((f) => f.code)).toEqual(["MISSING_SERIAL"]);
    expect(v1.priceCheck?.marketLow).toBe(cleanPs5.marketPrice.marketLow);

    let snap = await loadSnapshot(services, deal.id);
    const photo = snap.demo?.requestPhotos[0];
    if (!photo) throw new Error("expected a demo photo to add");
    const card2 = await applyBuyerRequest(services, deal.id, { request: { field: "photos", request: "a close-up of the serial on the console" }, sellerReply: "Added. Close-up of the label on the back, same serial.", photos: [photo] });
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
    expect(captured.payeeEmail).toBe(cleanPs5.cards[0]!.sellerPaypalEmail);
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
    expect(check.observed.serial).toBe(CLEAN_SERIAL);
    expect(check.photos?.length).toBe(snap.demo?.arrivalPhotos.length);

    await completeDeal(services, deal.id);
    snap = await loadSnapshot(services, deal.id);
    expect(snap.deal.state).toBe("COMPLETE");
    expect(snap.events.map((e) => e.kind)).toEqual(expect.arrayContaining(["agreed", "card_locked", "payment_created", "payment_captured", "shipped", "delivered", "arrival_checked"]));
  });
});

describe("empty-box", () => {
  it("reaches ISSUE when the box arrives empty, with an evidence pack holding the arrival photos", async () => {
    const services = noKeys();
    const deal = await startDemoDeal(services, "empty-box");

    const v = await runReview(services, deal.id);
    expect(v.overall).toBe("go");
    await agreeBoth(services, deal.id);
    await payAndShip(services, deal.id, "venmo");
    await confirmDelivery(services, deal.id);
    let snap = await loadSnapshot(services, deal.id);

    const arrivalPhotos = snap.demo?.arrivalPhotos ?? [];
    const check = await checkArrival(services, deal.id, arrivalPhotos);
    expect(check.matches).toBe(false);
    expect(check.mismatches.map((m) => m.field)).toEqual(expect.arrayContaining(emptyBox.expectedArrival!.mismatchFields));

    // The issue step's "The box arrived empty" choice: the mismatch reason plus a detail line.
    await reportIssue(services, deal.id, "arrival_mismatch", "The box arrived empty.");
    snap = await loadSnapshot(services, deal.id);
    expect(snap.deal.state).toBe("ISSUE");
    expect(snap.hasEvidence).toBe(true);
    const opened = snap.events.find((e) => e.kind === "state_changed" && e.toState === "ISSUE");
    expect(opened?.summary).toContain("The box arrived empty.");
    const pack = await services.store.getEvidence(deal.id);
    expect(pack?.lockedCard.serial).toBe(EMPTY_BOX_LOCKED_SERIAL);
    expect(pack?.lockedCard.boxSerial).toBe(EMPTY_BOX_LOCKED_SERIAL);
    expect(pack?.arrivalCheck?.matches).toBe(false);
    for (const photo of arrivalPhotos) expect(pack?.photos.map((p) => p.url)).toContain(photo.url);
  });
});

describe("issue before delivery", () => {
  it("lets the buyer open an issue from SHIPPED when the item never arrives, with an evidence pack", async () => {
    const services = noKeys();
    const deal = await startDemoDeal(services, "clean-ps5");
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

describe("ship-time check (contracts v1.6.0)", () => {
  it("saves the Buyer Pal's shipment flags, records shipment_checked, tells the buyer, and still moves to SHIPPED", async () => {
    const services = noKeys();
    const deal = await startDemoDeal(services, "empty-box");
    await runReview(services, deal.id);
    await agreeBoth(services, deal.id);
    const payment = await createOrder(services, deal.id, "venmo");
    await captureOrder(services, deal.id, payment.paypalOrderId);
    let snap = await loadSnapshot(services, deal.id);
    const packing = snap.demo?.packing;
    if (!packing) throw new Error("expected packing hints");
    // The seller skips the required "item going into the box" photo and ticks nothing.
    const shipment = await markShipped(services, deal.id, { carrier: packing.carrier, trackingNumber: packing.trackingNumber, packingPhotos: packing.photos, doneIds: [] });
    snap = await loadSnapshot(services, deal.id);
    expect(snap.deal.state).toBe("SHIPPED");
    expect(shipment.flags?.map((f) => f.code)).toContain("MISSING_PACKING_PHOTO");
    expect(snap.shipment?.flags?.map((f) => f.code)).toContain("MISSING_PACKING_PHOTO");
    const checked = snap.events.find((e) => e.kind === "shipment_checked");
    expect(checked?.actor).toBe("buyer_pal");
    expect(checked?.data?.flags).toContain("MISSING_PACKING_PHOTO");
    // The event summary is the pal message capped at 300 characters; the buyer's pane carries the full line.
    const palLine = snap.messages.find((m) => m.channel === "buyer_pal" && m.text.startsWith(checked!.summary.slice(0, 80)));
    expect(palLine).toBeDefined();
    expect(checked!.summary.length).toBeLessThanOrEqual(300);
    // A deal that ships with every required step done raises nothing.
    const clean = await startDemoDeal(services, "clean-ps5");
    await runReview(services, clean.id);
    await agreeBoth(services, clean.id);
    const cleanPacking = await payAndShip(services, clean.id, "paypal");
    const cleanSnap = await loadSnapshot(services, clean.id);
    expect(cleanPacking).toBeDefined();
    expect(cleanSnap.shipment?.flags ?? []).toEqual([]);
    expect(cleanSnap.events.some((e) => e.kind === "shipment_checked")).toBe(false);
  });

  it("the seeded empty-box deal carries the fixture's ship-time flag and event", async () => {
    const services = noKeys();
    const id = (await services.seededDeals)["empty-box"]!;
    const snap = await loadSnapshot(services, id);
    expect(snap.shipment?.flags?.map((f) => f.code)).toEqual(["MISSING_PACKING_PHOTO"]);
    const checked = snap.events.find((e) => e.kind === "shipment_checked");
    expect(checked?.actor).toBe("buyer_pal");
    expect(checked?.data?.flags).toEqual(["MISSING_PACKING_PHOTO"]);
    expect(snap.messages.some((m) => m.channel === "buyer_pal" && m.text === checked?.summary)).toBe(true);
  });
});

describe("buyer-first (PLAN.md Decision 7)", () => {
  const buyer = { displayName: "Dana M.", email: "dana.m@example.com" };

  it("invites the seller, who joins with photos; the card is built and the deal is LISTED", async () => {
    const services = noKeys();
    const deal = await startBuyerFirst(services, { buyer, sellerEmail: "matt.m@example.com", listingUrl: "https://marketplace.example/listings/5120" });
    expect(deal.state).toBe("INVITED");
    expect(deal.startedBy).toBe("buyer");
    expect(deal.seller.displayName).toBe("matt.m");
    let snap = await loadSnapshot(services, deal.id);
    expect(snap.events.map((e) => e.kind)).toEqual(["deal_created", "seller_invited", "state_changed"]);
    expect(snap.currentCard).toBeNull();
    await expect(runReview(services, deal.id)).rejects.toThrow(/nothing to review/);

    const joined = await sellerJoin(services, deal.id, {
      displayName: "Matt M.",
      sellerPaypalEmail: "matt.m@example.com",
      listingText: cleanPs5.listingText,
      sellerNotes: cleanPs5.sellerNotes,
      photos: cleanPs5.listingPhotos,
    });
    expect(joined.state).toBe("LISTED");
    expect(joined.sellerJoinedAt).not.toBeNull();
    expect(joined.seller.displayName).toBe("Matt M.");
    snap = await loadSnapshot(services, deal.id);
    expect(snap.events.map((e) => e.kind)).toContain("seller_joined");
    expect(snap.currentCard?.serial).toBe(CLEAN_SERIAL);
    expect(snap.currentCard?.askingPrice).toBe(420);

    const verdict = await runReview(services, deal.id);
    expect(verdict.overall).toBe("go");
  });

  it("a seller who declines on the join page is reviewed with no card and the deal ends BLOCKED", async () => {
    const services = noKeys();
    const deal = await startBuyerFirst(services, { buyer, sellerEmail: "quickcash.deals.2026@example.com", listingUrl: "https://marketplace.example/listings/8841" });
    await declineInvite(services, deal.id, { by: "seller", reason: "I only take Friends and Family, no fees. Send it tonight or it goes to the next person." });
    let snap = await loadSnapshot(services, deal.id);
    expect(snap.inviteDeclined).toBe(true);
    expect(snap.deal.state).toBe("INVITED");

    const verdict = await runReview(services, deal.id);
    expect(verdict.cardVersion).toBe(0);
    expect(verdict.flags.map((f) => f.code)).toContain("INVITE_REFUSED");
    expect(verdict.overall).toBe("stop");
    snap = await loadSnapshot(services, deal.id);
    expect(snap.deal.state).toBe("BLOCKED");
    expect(snap.payment).toBeNull();
    expect(snap.events.map((e) => e.kind)).toEqual(expect.arrayContaining(["invite_declined", "review_posted"]));
  });

  it("the buyer can record what the seller said outside Pay Pals; the refusal is reviewed with no card and blocks", async () => {
    const services = noKeys();
    const deal = await startBuyerFirst(services, { buyer, sellerEmail: "seller@example.com", listingUrl: null });
    await declineInvite(services, deal.id, { by: "buyer", reason: "No Pay Pals, Friends and Family only or I sell to someone else." });
    const snap0 = await loadSnapshot(services, deal.id);
    expect(snap0.events.find((e) => e.kind === "invite_declined")?.summary).toMatch(/says the seller declined/);
    const verdict = await runReview(services, deal.id);
    expect(verdict.cardVersion).toBe(0);
    expect(verdict.flags.map((f) => f.code)).toContain("INVITE_REFUSED");
    expect((await loadSnapshot(services, deal.id)).deal.state).toBe("BLOCKED");
  });

  it("a plain chat line from the buyer is enough to review, but the pal's rules read only the seller's own words", async () => {
    const services = noKeys();
    const deal = await startBuyerFirst(services, { buyer, sellerEmail: "seller@example.com", listingUrl: null });
    await postChat(services, deal.id, "buyer", "The seller replied: Friends and Family only.");
    const verdict = await runReview(services, deal.id);
    expect(verdict.cardVersion).toBe(0);
    expect(verdict.flags.map((f) => f.code)).not.toContain("INVITE_REFUSED");
    const snap = await loadSnapshot(services, deal.id);
    expect(snap.deal.state).toBe("REVIEWED");
    expect(snap.currentCard).toBeNull();
  });

  it("the fixture demos start the way their timelines do: buyer-first scenarios carry the invite and the join", async () => {
    const services = noKeys();
    const clean = await loadSnapshot(services, (await startDemoDeal(services, "clean-ps5")).id);
    expect(clean.deal.startedBy).toBe("buyer");
    expect(clean.deal.listingUrl).toBe(cleanPs5.deal.listingUrl);
    expect(clean.deal.sellerJoinedAt).not.toBeNull();
    expect(clean.events.map((e) => e.kind).slice(0, 4)).toEqual(["deal_created", "seller_invited", "state_changed", "seller_joined"]);
    expect(clean.deal.state).toBe("LISTED");
    const empty = await loadSnapshot(services, (await startDemoDeal(services, "empty-box")).id);
    expect(empty.deal.startedBy).toBe("seller");
    expect(empty.events.map((e) => e.kind)).not.toContain("seller_invited");
  });
});

describe("tamper-evident history (PLAN.md Decision 9)", () => {
  it("writes the chain head into the order and the evidence pack verifies it", async () => {
    const services = noKeys();
    const deal = await startDemoDeal(services, "empty-box");
    await runReview(services, deal.id);
    await agreeBoth(services, deal.id);
    const eventsBefore = await services.store.listEvents(deal.id);
    const payment = await createOrder(services, deal.id, "paypal");
    expect(payment.historyHash).toBe(eventsBefore[eventsBefore.length - 1]?.hash);
    expect(payment.historyHash).toHaveLength(64);
    await captureOrder(services, deal.id, payment.paypalOrderId);
    const snap = await loadSnapshot(services, deal.id);
    const packing = snap.demo?.packing;
    if (!packing) throw new Error("expected packing hints");
    await markShipped(services, deal.id, { carrier: packing.carrier, trackingNumber: packing.trackingNumber, packingPhotos: packing.photos, doneIds: [] });
    await reportIssue(services, deal.id, "not_arrived");
    const pack = await services.store.getEvidence(deal.id);
    expect(pack?.historyHash).toBe(payment.historyHash);
    expect(pack?.historyVerified).toBe(true);
    expect(historyMatchesHead(pack!.timeline, pack!.historyHash!)).toBe(true);
    for (const e of pack!.timeline) expect(e.hash).toHaveLength(64);
  });
});

describe("two-sided agreement", () => {
  it("clears the buyer's agreement when the seller changes the card, so the buyer agrees again", async () => {
    const services = noKeys();
    const deal = await startDemoDeal(services, "clean-ps5");
    await runReview(services, deal.id);
    await agree(services, deal.id, "buyer", false);
    let snap = await loadSnapshot(services, deal.id);
    expect(snap.deal.buyerAgreedAt).not.toBeNull();

    const photo = snap.demo?.requestPhotos[0];
    if (!photo) throw new Error("expected a demo photo to add");
    await applyBuyerRequest(services, deal.id, { request: { field: "photos", request: "a close-up of the serial on the console" }, sellerReply: "Added the close-up of the serial.", photos: [photo] });
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
    const deal = await startDemoDeal(services, "empty-box");
    await runReview(services, deal.id);
    await agree(services, deal.id, "seller", false);
    await agree(services, deal.id, "seller", false);
    const snap = await loadSnapshot(services, deal.id);
    expect(snap.events.filter((e) => e.kind === "agreed")).toHaveLength(1);
    expect(snap.deal.state).toBe("REVIEWED");
  });
});
