import { buildCustomId, cleanPs5, emptyBox, fakeSlab, type Verdict } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { readOrderFields } from "./paypal-confirmation";
import { countStatuses, dealStatusView, STATUS_LEGEND, type StatusGroup, type StatusInput, type StatusLabel } from "./status-view";

const events = cleanPs5.timeline;
const head = events[events.length - 1]!.hash;
const lockedCard = cleanPs5.cards[cleanPs5.cards.length - 1]!;

function verdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    dealId: cleanPs5.deal.id,
    cardVersion: lockedCard.version,
    overall: "go",
    flags: [],
    priceCheck: cleanPs5.marketPrice,
    questionsForSeller: [],
    palMessage: "Looks fine.",
    createdAt: "2026-10-09T10:00:00.000Z",
    ...overrides,
  };
}

function liveOrder(extra: Record<string, unknown> = {}) {
  return readOrderFields({
    id: "2NW245573K1279237",
    status: "COMPLETED",
    purchase_units: [
      {
        custom_id: buildCustomId(cleanPs5.deal.id, head),
        payee: { email_address: lockedCard.sellerPaypalEmail },
        amount: { currency_code: "USD", value: lockedCard.askingPrice.toFixed(2) },
        items: [{ name: lockedCard.title }],
        payments: { captures: [{ id: "9PC825472S929124S", status: "COMPLETED", amount: { currency_code: "USD", value: lockedCard.askingPrice.toFixed(2) } }] },
        ...extra,
      },
    ],
  });
}

function input(overrides: Partial<StatusInput> = {}): StatusInput {
  return {
    deal: { ...cleanPs5.deal, buyerAgreedAt: "2026-10-09T09:00:00.000Z", sellerAgreedAt: "2026-10-09T09:05:00.000Z" },
    cards: cleanPs5.cards,
    lockedCard,
    verdicts: [verdict()],
    arrivalCheck: null,
    payment: null,
    paypalRead: { kind: "none" },
    shipment: null,
    events,
    hasEvidence: false,
    ...overrides,
  };
}

function group(groups: StatusGroup[], id: string): StatusGroup {
  return groups.find((g) => g.id === id)!;
}

function item(groups: StatusGroup[], groupId: string, itemId: string) {
  return group(groups, groupId).items.find((i) => i.id === itemId)!;
}

describe("dealStatusView", () => {
  it("has exactly the five groups the product asks for, in order", () => {
    expect(dealStatusView(input()).map((g) => g.id)).toEqual(["card", "evidence", "payment", "shipping", "delivery"]);
  });

  it("gives every line one of exactly three labels", () => {
    const allowed: StatusLabel[] = ["verified", "unverified", "missing"];
    for (const fixture of [input(), input({ lockedCard: null, cards: [], verdicts: [] }), input({ payment: cleanPs5.payment, paypalRead: { kind: "example" } })]) {
      for (const g of dealStatusView(fixture)) {
        expect(g.items.length).toBeGreaterThan(0);
        for (const i of g.items) {
          expect(allowed).toContain(i.status);
          expect(i.detail.length).toBeGreaterThan(10);
          expect(i.detail).not.toContain("—");
        }
      }
    }
  });

  it("gives every line a unique id inside its group", () => {
    for (const g of dealStatusView(input({ verdicts: [verdict({ questionsForSeller: ["One?", "Two?"] })] }))) {
      expect(new Set(g.items.map((i) => i.id)).size).toBe(g.items.length);
    }
  });

  it("says what Verified means before saying anything is verified", () => {
    expect(STATUS_LEGEND).toMatch(/checked that line against something named in it/);
    expect(STATUS_LEGEND).toMatch(/never means the item is genuine or that the seller owns it/);
  });
});

describe("the agreed item card", () => {
  it("verifies the lock and the two agreements, naming what each was checked against", () => {
    const groups = dealStatusView(input());
    expect(item(groups, "card", "card-locked").status).toBe("verified");
    expect(item(groups, "card", "card-locked").detail).toMatch(/both sides have agreed to that same version/);
    expect(item(groups, "card", "both-agreed").status).toBe("verified");
    expect(item(groups, "card", "both-agreed").detail).toMatch(new RegExp(`card version ${cleanPs5.deal.lockedCardVersion}`));
  });

  it("is unverified while the card is still open to change", () => {
    const groups = dealStatusView(input({ lockedCard: null, deal: { ...cleanPs5.deal, lockedCardVersion: null, buyerAgreedAt: null, sellerAgreedAt: null } }));
    expect(item(groups, "card", "card-locked").status).toBe("unverified");
    expect(item(groups, "card", "both-agreed").status).toBe("missing");
  });

  it("is unverified when only one side has agreed", () => {
    const groups = dealStatusView(input({ deal: { ...cleanPs5.deal, sellerAgreedAt: null, buyerAgreedAt: "2026-10-09T09:00:00.000Z" } }));
    expect(item(groups, "card", "both-agreed").status).toBe("unverified");
    expect(item(groups, "card", "both-agreed").detail).toMatch(/The buyer agreed/);
  });

  it("verifies the card text on the order only against a live read, and names the line PayPal holds", () => {
    const groups = dealStatusView(input({ payment: cleanPs5.payment, paypalRead: { kind: "confirmed", order: liveOrder() } }));
    const line = item(groups, "card", "card-on-order");
    expect(line.status).toBe("verified");
    expect(line.detail).toContain(lockedCard.title);
    expect(line.detail).toMatch(/PayPal's own record of the order/);
  });

  it("does not verify the card text when PayPal's item line is a different item", () => {
    const order = readOrderFields({ id: "X", status: "COMPLETED", purchase_units: [{ items: [{ name: "A completely different thing" }] }] });
    const line = item(dealStatusView(input({ payment: cleanPs5.payment, paypalRead: { kind: "confirmed", order } })), "card", "card-on-order");
    expect(line.status).toBe("unverified");
    expect(line.detail).toMatch(/not the same text/);
  });

  it("is missing, not unverified, when no order exists", () => {
    expect(item(dealStatusView(input()), "card", "card-on-order").status).toBe("missing");
  });
});

describe("the evidence", () => {
  it("verifies a serial that matched the box label, and says what that does not prove", () => {
    const card = { ...lockedCard, serial: "AJ164952580", boxSerial: "AJ164952580" };
    const line = item(dealStatusView(input({ lockedCard: card, cards: [card] })), "evidence", "serial");
    expect(line.status).toBe("verified");
    expect(line.detail).toMatch(/supports the listing/);
    expect(line.detail).toMatch(/not a check of ownership and not a check that the item is genuine/);
  });

  it("does not verify a serial with nothing to compare it with", () => {
    const card = { ...lockedCard, serial: "AJ164952580", boxSerial: null };
    expect(item(dealStatusView(input({ lockedCard: card, cards: [card] })), "evidence", "serial").status).toBe("unverified");
  });

  it("does not verify a serial that disagrees with the box label", () => {
    const card = { ...lockedCard, serial: "AJ164952580", boxSerial: "ZZ000000000" };
    const line = item(dealStatusView(input({ lockedCard: card, cards: [card] })), "evidence", "serial");
    expect(line.status).toBe("unverified");
    expect(line.detail).toMatch(/different numbers/);
  });

  it("has no serial line to verify when the card carries none", () => {
    const card = { ...lockedCard, serial: null, boxSerial: null };
    expect(item(dealStatusView(input({ lockedCard: card, cards: [card] })), "evidence", "serial").status).toBe("missing");
  });

  it("verifies a cert against the grader record and says that is not a check of the slab", () => {
    const card = fakeSlab.cards[fakeSlab.cards.length - 1]!;
    const check = { record: fakeSlab.certRecord!, matches: true, explanation: "The record describes this card." };
    const line = item(dealStatusView(input({ lockedCard: card, cards: fakeSlab.cards, verdicts: [verdict({ certCheck: check })] })), "evidence", "cert");
    expect(line.status).toBe("verified");
    expect(line.detail).toMatch(/not a check that the slab is genuine or that the seller owns it/);
  });

  it("does not verify a cert that was never checked, and never calls an unknown cert a mismatch", () => {
    const card = fakeSlab.cards[fakeSlab.cards.length - 1]!;
    const check = { record: fakeSlab.certRecord!, matches: null, explanation: "No grader access, so this was not checked." };
    const line = item(dealStatusView(input({ lockedCard: card, cards: fakeSlab.cards, verdicts: [verdict({ certCheck: check })] })), "evidence", "cert");
    expect(line.status).toBe("unverified");
    expect(line.detail).toMatch(/was not checked/);
  });

  it("leaves the cert line out for an item with no cert number", () => {
    expect(group(dealStatusView(input()), "evidence").items.some((i) => i.id === "cert")).toBe(false);
  });

  it("holds photos without verifying them, and says the one check it does run", () => {
    const line = item(dealStatusView(input()), "evidence", "photos");
    expect(line.status).toBe("unverified");
    expect(line.detail).toMatch(/does not check where a photo came from beyond its reused-photo check/);
  });

  it("lists a question the Buyer Pal asked and never got as missing", () => {
    const groups = dealStatusView(input({ verdicts: [verdict({ questionsForSeller: ["Can you send a close-up of the serial label?"] })] }));
    const line = group(groups, "evidence").items.find((i) => i.id === "question-0")!;
    expect(line.status).toBe("missing");
    expect(line.detail).toContain("Can you send a close-up of the serial label?");
  });

  it("lists an open flag as unresolved and unverified, and leaves info flags out", () => {
    const flags = [
      { code: "URGENCY_PRESSURE" as const, severity: "caution" as const, evidence: "pay today", explanation: "The seller is pushing for a fast payment.", raisedByRule: true },
      { code: "OTHER" as const, severity: "info" as const, evidence: "a note", explanation: "Just a note.", raisedByRule: true },
    ];
    const items = group(dealStatusView(input({ verdicts: [verdict({ flags })] })), "evidence").items.filter((i) => i.id.startsWith("flag-"));
    expect(items).toHaveLength(1);
    expect(items[0]!.label).toBe("Unresolved: pressure to pay now");
    expect(items[0]!.status).toBe("unverified");
  });
});

describe("the payment", () => {
  it("verifies the order, the capture, the amount and payee, and the hash, all off a live read", () => {
    const groups = dealStatusView(input({ payment: cleanPs5.payment, paypalRead: { kind: "confirmed", order: liveOrder() } }));
    for (const id of ["order", "capture", "amount-payee", "history-hash"]) expect(item(groups, "payment", id).status, id).toBe("verified");
    expect(item(groups, "payment", "order").detail).toMatch(/read back from PayPal's Orders API/);
    expect(item(groups, "payment", "amount-payee").detail).toContain(lockedCard.sellerPaypalEmail);
    expect(item(groups, "payment", "history-hash").detail).toMatch(/reproduces from the \d+ events stored here/);
  });

  it("titles the group a confirmation only when a live read confirmed something", () => {
    expect(group(dealStatusView(input({ payment: cleanPs5.payment, paypalRead: { kind: "confirmed", order: liveOrder() } })), "payment").title).toBe("Payment confirmed by PayPal");
    for (const read of [{ kind: "example" }, { kind: "mock" }, { kind: "failed" }, { kind: "none" }] as const) {
      expect(group(dealStatusView(input({ payment: cleanPs5.payment, paypalRead: read })), "payment").title, read.kind).toBe("Payment, not confirmed by PayPal");
    }
    expect(group(dealStatusView(input()), "payment").title).toBe("Payment, not confirmed by PayPal");
  });

  it("verifies nothing about a seeded example deal's payment", () => {
    const groups = dealStatusView(input({ payment: cleanPs5.payment, paypalRead: { kind: "example" } }));
    for (const line of group(groups, "payment").items) expect(line.status, line.id).not.toBe("verified");
    expect(item(groups, "payment", "order").detail).toMatch(/seeded example deal, so that id is a placeholder/);
  });

  it("verifies nothing when the live read did not come back", () => {
    const groups = dealStatusView(input({ payment: { ...cleanPs5.payment!, paypalOrderId: "2NW245573K1279237" }, paypalRead: { kind: "failed" } }));
    for (const line of group(groups, "payment").items) expect(line.status, line.id).not.toBe("verified");
    expect(item(groups, "payment", "order").detail).toMatch(/live read of the order did not come back/);
  });

  it("does not verify an amount or payee that disagrees with the locked card", () => {
    const order = liveOrder({
      amount: { currency_code: "USD", value: "999.00" },
      payee: { email_address: "someone.else@example.com" },
      payments: { captures: [{ id: "C", status: "COMPLETED", amount: { currency_code: "USD", value: "999.00" } }] },
    });
    const line = item(dealStatusView(input({ payment: cleanPs5.payment, paypalRead: { kind: "confirmed", order } })), "payment", "amount-payee");
    expect(line.status).toBe("unverified");
    expect(line.detail).toMatch(/the amount and the payee does not agree/);
  });

  it("does not verify the hash when the stored events do not reproduce it", () => {
    const order = liveOrder({ custom_id: buildCustomId(cleanPs5.deal.id, "f".repeat(64)) });
    expect(item(dealStatusView(input({ payment: cleanPs5.payment, paypalRead: { kind: "confirmed", order } })), "payment", "history-hash").status).toBe("unverified");
  });

  it("is missing all through for a deal that never paid", () => {
    const groups = dealStatusView(input());
    expect(item(groups, "payment", "order").status).toBe("missing");
    expect(item(groups, "payment", "capture").status).toBe("missing");
  });
});

describe("the shipment", () => {
  const shipment = { ...emptyBox.shipment!, dealId: cleanPs5.deal.id };

  it("never verifies a tracking number, because nothing asked the carrier", () => {
    const line = item(dealStatusView(input({ shipment })), "shipping", "tracking");
    expect(line.status).toBe("unverified");
    expect(line.detail).toMatch(/does not query the carrier/);
  });

  it("verifies the packing photos only when the ship-time check ran and found nothing", () => {
    const clean = { ...shipment, flags: [], packingPhotos: emptyBox.shipment!.packingPhotos.length > 0 ? emptyBox.shipment!.packingPhotos : [] };
    const line = item(dealStatusView(input({ shipment: clean })), "shipping", "packing-photos");
    expect(line.status).toBe(clean.packingPhotos.length > 0 ? "verified" : "missing");
  });

  it("does not verify packing photos with no ship-time check on record", () => {
    const photos = [{ url: "https://example.test/p.jpg", whatItShows: "The console in the box.", addedBy: "seller" as const }];
    const line = item(dealStatusView(input({ shipment: { ...shipment, flags: undefined, packingPhotos: photos } })), "shipping", "packing-photos");
    expect(line.status).toBe("unverified");
    expect(line.detail).toMatch(/No ship-time check is on record/);
  });

  it("names the ship-time flag the Buyer Pal raised", () => {
    const flags = [{ code: "MISSING_PACKING_PHOTO" as const, severity: "caution" as const, evidence: "no photo", explanation: "The seller shipped with no packing photo.", raisedByRule: true }];
    const line = item(dealStatusView(input({ shipment: { ...shipment, flags, packingPhotos: [] } })), "shipping", "packing-photos");
    expect(line.status).toBe("missing");
    expect(line.detail).toContain("a packing photo the seller skipped");
  });

  it("verifies the checklist against itself and names what it compared", () => {
    const checklist = [{ id: "a", label: "Photograph the serial", required: true, done: true }];
    const line = item(dealStatusView(input({ shipment: { ...shipment, checklist } })), "shipping", "checklist");
    expect(line.status).toBe("verified");
    expect(line.detail).toMatch(/the checklist the Seller Pal wrote for this card/);
  });

  it("does not verify a checklist with a required step left undone", () => {
    const checklist = [{ id: "a", label: "Photograph the serial", required: true, done: false }];
    const line = item(dealStatusView(input({ shipment: { ...shipment, checklist } })), "shipping", "checklist");
    expect(line.status).toBe("unverified");
    expect(line.detail).toContain("Photograph the serial");
  });

  it("is missing when nothing shipped", () => {
    expect(item(dealStatusView(input()), "shipping", "tracking").status).toBe("missing");
  });
});

describe("the delivery", () => {
  it("never verifies a delivery, because the buyer pressing confirm is not a carrier scan", () => {
    const shipment = { ...emptyBox.shipment!, dealId: cleanPs5.deal.id, deliveredAt: "2026-10-09T12:00:00.000Z" };
    const line = item(dealStatusView(input({ shipment })), "delivery", "delivered");
    expect(line.status).toBe("unverified");
    expect(line.detail).toMatch(/did not read a carrier scan/);
  });

  it("verifies an arrival check that matched the locked card and says what it compared", () => {
    const check = {
      dealId: cleanPs5.deal.id,
      cardVersion: lockedCard.version,
      matches: true,
      mismatches: [],
      observed: { brand: "Sony", model: "PlayStation 5", serial: "AJ164952580" },
      palMessage: "It is the same console.",
      createdAt: "2026-10-09T12:30:00.000Z",
    };
    const line = item(dealStatusView(input({ arrivalCheck: check })), "delivery", "arrival-check");
    expect(line.status).toBe("verified");
    expect(line.detail).toMatch(new RegExp(`locked card version ${lockedCard.version}`));
    expect(line.detail).toContain("AJ164952580");
  });

  it("does not verify an arrival check that found a difference, and names it", () => {
    const check = {
      dealId: cleanPs5.deal.id,
      cardVersion: lockedCard.version,
      matches: false,
      mismatches: [{ field: "serial" as const, expected: "AJ164952580", observed: "nothing in the box", explanation: "The box was empty." }],
      observed: { brand: null, model: null, serial: null },
      palMessage: "The console is not there.",
      createdAt: "2026-10-09T12:30:00.000Z",
    };
    const line = item(dealStatusView(input({ arrivalCheck: check })), "delivery", "arrival-check");
    expect(line.status).toBe("unverified");
    expect(line.detail).toContain("nothing in the box");
  });

  it("says the evidence pack is useful context for a dispute and never promises an outcome", () => {
    const line = item(dealStatusView(input({ hasEvidence: true })), "delivery", "evidence-pack");
    expect(line.status).toBe("unverified");
    expect(line.detail).toMatch(/Useful context for a PayPal dispute/);
    expect(line.detail.toLowerCase()).not.toMatch(/guarantee|will win|refund/);
  });

  it("is missing all through for a deal that never shipped", () => {
    const early = events.filter((e) => e.kind !== "delivered");
    const groups = dealStatusView(input({ events: early }));
    for (const id of ["delivered", "arrival-check", "evidence-pack"]) expect(item(groups, "delivery", id).status, id).toBe("missing");
  });
});

describe("countStatuses", () => {
  it("counts the labels across every group", () => {
    const counts = countStatuses(dealStatusView(input()));
    expect(counts.verified + counts.unverified + counts.missing).toBe(dealStatusView(input()).reduce((n, g) => n + g.items.length, 0));
    expect(counts.verified).toBeGreaterThan(0);
  });
});
