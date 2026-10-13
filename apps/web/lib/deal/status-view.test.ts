import { buildCustomId, cleanPs5, emptyBox, fakeSlab, type Verdict } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { readOrderFields } from "./paypal-confirmation";
import { countStatuses, dealStatusView, splitUnreached, STATUS_LEGEND, type StatusGroup, type StatusInput, type StatusLabel } from "./status-view";

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

  it("gives every line one of exactly four labels", () => {
    const allowed: StatusLabel[] = ["verified", "flagged", "unverified", "missing"];
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

  it("says what all four labels mean before saying anything is any of them", () => {
    expect(STATUS_LEGEND).toMatch(/Verified: checked and matched/);
    // The whole point of the split: "we looked and it is wrong" is not "we never looked".
    expect(STATUS_LEGEND).toMatch(/Flagged: checked and didn't match/);
    expect(STATUS_LEGEND).toMatch(/Unverified: on file, not checked/);
    expect(STATUS_LEGEND).toMatch(/Missing: not on record/);
    // What a match does not prove is said once per page, on the item card or in the cert headline, not here.
    expect(STATUS_LEGEND).not.toMatch(/genuine|owns/);
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

  it("flags the card text when PayPal's item line is a different item, rather than calling it unchecked", () => {
    const order = readOrderFields({ id: "X", status: "COMPLETED", purchase_units: [{ items: [{ name: "A completely different thing" }] }] });
    const line = item(dealStatusView(input({ payment: cleanPs5.payment, paypalRead: { kind: "confirmed", order } })), "card", "card-on-order");
    // Both texts were in hand and they disagree. That is a check that ran and failed.
    expect(line.status).toBe("flagged");
    expect(line.detail).toMatch(/not the same text/);
  });

  it("is missing, not unverified, when no order exists", () => {
    expect(item(dealStatusView(input()), "card", "card-on-order").status).toBe("missing");
  });
});

describe("the evidence", () => {
  it("verifies a serial that matched the box label, and leaves the caveat to the item card", () => {
    const card = { ...lockedCard, serial: "AJ164952580", boxSerial: "AJ164952580" };
    const line = item(dealStatusView(input({ lockedCard: card, cards: [card] })), "evidence", "serial");
    expect(line.status).toBe("verified");
    // The caveat is said once per page, on the item card. The row carries only the comparison.
    expect(line.detail).not.toMatch(/supports the listing|not a check/);
  });

  it("does not verify a serial with nothing to compare it with", () => {
    const card = { ...lockedCard, serial: "AJ164952580", boxSerial: null };
    expect(item(dealStatusView(input({ lockedCard: card, cards: [card] })), "evidence", "serial").status).toBe("unverified");
  });

  it("flags a serial that disagrees with the box label", () => {
    const card = { ...lockedCard, serial: "AJ164952580", boxSerial: "ZZ000000000" };
    const line = item(dealStatusView(input({ lockedCard: card, cards: [card] })), "evidence", "serial");
    expect(line.status).toBe("flagged");
    expect(line.detail).toMatch(/different numbers/);
  });

  it("has no serial line to verify when the card carries none", () => {
    const card = { ...lockedCard, serial: null, boxSerial: null };
    expect(item(dealStatusView(input({ lockedCard: card, cards: [card] })), "evidence", "serial").status).toBe("missing");
  });

  it("verifies a cert against the grader record and leaves the caveat to the review", () => {
    const card = fakeSlab.cards[fakeSlab.cards.length - 1]!;
    const check = { record: fakeSlab.certRecord!, matches: true, explanation: "The record describes this card." };
    const line = item(dealStatusView(input({ lockedCard: card, cards: fakeSlab.cards, verdicts: [verdict({ certCheck: check })] })), "evidence", "cert");
    expect(line.status).toBe("verified");
    expect(line.detail).not.toMatch(/not a check|supports the listing/);
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
    expect(line.detail).toMatch(/compares them against its own set of pictures and nothing else/);
  });

  it("flags a reused photo in the words packages/agents uses, claiming no web search", () => {
    const flags = [{ code: "STOCK_OR_REUSED_PHOTO" as const, severity: "caution" as const, evidence: "3 of 64 bits differ", explanation: "x", raisedByRule: true }];
    const line = item(dealStatusView(input({ verdicts: [verdict({ flags })] })), "evidence", "photos");
    expect(line.status).toBe("flagged");
    expect(line.detail).toMatch(/matches a listing photo already on file/);
    // The match is against Pay Pals' own file of photos, never a search of the web.
    expect(line.detail).not.toMatch(/online|web|internet|searched/i);
  });

  /*
    These three used to be a row each, and between them they were most of the
    view's length. The review panel above prints all three in full, so the view
    now counts them and links to them (Matt's rule 1). The tests moved with the
    behaviour: each one proves the rows are gone AND that the count that
    replaced them is right, so a future edit cannot quietly drop the pointer
    and leave the facts nowhere.
  */
  it("prints no row for a question the pal asked, and counts it in the note instead", () => {
    const groups = dealStatusView(input({ verdicts: [verdict({ questionsForSeller: ["Can you send a close-up of the serial label?"] })] }));
    const evidence = group(groups, "evidence");
    expect(evidence.items.some((i) => i.id.startsWith("question-"))).toBe(false);
    expect(evidence.note?.text).toContain("1 question for the seller");
    expect(evidence.note?.href).toBe("#buyer-pal-review");
  });

  it("prints no row per thing the pal could not check, and counts those too", () => {
    const reasoning = {
      checked: ["The serial against the box label."],
      found: ["Both read the same number."],
      couldNotVerify: ["Whether the seller owns the console.", "Whether the console powers on."],
      wouldChangeMyMind: ["A photo of it powered on."],
    };
    const evidence = group(dealStatusView(input({ verdicts: [verdict({ reasoning })] })), "evidence");
    expect(evidence.items.some((i) => i.id.startsWith("could-not-verify-"))).toBe(false);
    expect(evidence.note?.text).toContain("2 it could not check");
  });

  it("prints no unresolved-flag row, and counts the flags, leaving info flags out", () => {
    const flags = [
      { code: "URGENCY_PRESSURE" as const, severity: "caution" as const, evidence: "pay today", explanation: "The seller is pushing for a fast payment.", raisedByRule: true },
      { code: "OTHER" as const, severity: "info" as const, evidence: "a note", explanation: "Just a note.", raisedByRule: true },
    ];
    const evidence = group(dealStatusView(input({ verdicts: [verdict({ flags })] })), "evidence");
    expect(evidence.items.some((i) => i.id.startsWith("flag-"))).toBe(false);
    expect(evidence.note?.text).toContain("1 flag");
    expect(evidence.note?.text).not.toContain("2 flags");
  });

  it("has no note at all when the pal raised nothing, rather than a link to an empty review", () => {
    expect(group(dealStatusView(input()), "evidence").note).toBeUndefined();
  });
});

/*
  The name check used to appear only when it failed, so a pass left no trace
  anywhere on the page and a reader could not tell "checked, fine" from "never
  looked". All three outcomes are read off the verdict, never recomputed here:
  packages/agents owns the comparison (Decision 15).
*/
describe("the PayPal address against the seller's name", () => {
  const nameFlag = {
    code: "NAME_MISMATCH" as const,
    severity: "caution" as const,
    evidence: "Seller Dana M. (dana@example.com) but the PayPal account that gets paid is quickpay2026@example.com",
    explanation: "The PayPal account that would get paid does not match the seller's name, so ask whose account it is before you pay.",
    raisedByRule: true,
  };

  it("says the check passed, which it never used to say at all", () => {
    const line = item(dealStatusView(input()), "evidence", "payee-name");
    expect(line.status).toBe("verified");
    expect(line.detail).toContain(lockedCard.sellerPaypalEmail);
    expect(line.detail).toContain(cleanPs5.deal.seller.displayName);
    // A name-shaped address is not proof of who holds the account, and the line says so.
    expect(line.detail).toMatch(/not proof of who owns the account/);
  });

  const asSeller = (displayName: string, email: string, paypal: string) => {
    const card = { ...lockedCard, sellerPaypalEmail: paypal };
    return input({ lockedCard: card, cards: [card], deal: { ...cleanPs5.deal, seller: { ...cleanPs5.deal.seller, displayName, email } } });
  };

  it("says the address contains the name only when it does", () => {
    const line = item(dealStatusView(asSeller("Dana Moore", "dana@example.com", "dana.moore@example.com")), "evidence", "payee-name");
    expect(line.status).toBe("verified");
    expect(line.detail).toContain("The address contains part of the seller's name.");
    expect(line.detail).not.toMatch(/\bagree\b/);
  });

  it("does not say they agree when the address is just the seller's contact email", () => {
    const line = item(dealStatusView(asSeller("Dana Moore", "quickpay2026@example.com", "quickpay2026@example.com")), "evidence", "payee-name");
    expect(line.detail).toContain("compared quickpay2026@example.com with Dana Moore");
    expect(line.detail).toContain("does not appear in the address");
    expect(line.detail).toContain("contact email");
    expect(line.detail).not.toMatch(/\bagree\b/);
  });

  it("names what was compared on a flag whose evidence does not", () => {
    const bare = { ...nameFlag, evidence: "The name and the address differ." };
    const line = item(dealStatusView(input({ verdicts: [verdict({ flags: [bare] })] })), "evidence", "payee-name");
    expect(line.status).toBe("flagged");
    expect(line.detail).toContain(`compared ${lockedCard.sellerPaypalEmail} with ${cleanPs5.deal.seller.displayName}`);
  });

  it("flags it when the pal raised the mismatch, in the pal's own words", () => {
    const line = item(dealStatusView(input({ verdicts: [verdict({ flags: [nameFlag] })] })), "evidence", "payee-name");
    expect(line.status).toBe("flagged");
    expect(line.detail).toContain(nameFlag.explanation);
    expect(line.detail).toContain(nameFlag.evidence);
  });

  it("is unverified, not verified, when the pal says it was given no name to check", () => {
    const reasoning = {
      checked: [],
      found: [],
      couldNotVerify: ["I was not given the seller's name on the account, so I could not check it against the PayPal address on the card."],
      wouldChangeMyMind: [],
    };
    const line = item(dealStatusView(input({ verdicts: [verdict({ reasoning })] })), "evidence", "payee-name");
    expect(line.status).toBe("unverified");
    expect(line.detail).toMatch(/not given the seller's name/);
  });

  it("is unverified, and says why, when the seller's name is only initials", () => {
    const reasoning = {
      checked: [],
      found: [],
      couldNotVerify: ["The seller's name on the account is only initials, so I could not check it against the PayPal address on the card."],
      wouldChangeMyMind: [],
    };
    const line = item(dealStatusView(input({ verdicts: [verdict({ reasoning })] })), "evidence", "payee-name");
    expect(line.status).toBe("unverified");
    expect(line.detail).toMatch(/only initials/);
  });

  it("has no line at all before a review has run, rather than claiming a pass", () => {
    expect(group(dealStatusView(input({ verdicts: [] })), "evidence").items.some((i) => i.id === "payee-name")).toBe(false);
  });
});

describe("splitUnreached", () => {
  /*
    A deal that stopped at the review: no payment, no shipment, and a timeline
    that never reached delivery. The clean fixture's own timeline carries a
    delivered event, so passing it here would leave the delivery group
    non-empty and nothing would collapse. That is the guard working, not the
    case under test, so the fixture has to be coherent with the state.
  */
  const early = { events: [], payment: null, shipment: null, arrivalCheck: null, hasEvidence: false } as const;

  it("collapses the trailing stages a blocked deal never got to", () => {
    const groups = dealStatusView(input({ ...early, deal: { ...cleanPs5.deal, state: "BLOCKED" } }));
    const { shown, skipped } = splitUnreached(groups, { state: "BLOCKED" });
    expect(shown.map((g) => g.id)).toEqual(["card", "evidence"]);
    expect(skipped?.names).toBe("payment, shipping and delivery");
    expect(skipped?.because).toBe("This deal ended before payment, so no money moved.");
  });

  it("collapses the card group too when a deal ended before any card was agreed", () => {
    const open = { ...cleanPs5.deal, state: "BLOCKED" as const, lockedCardVersion: null, buyerAgreedAt: null, sellerAgreedAt: null };
    const groups = dealStatusView(input({ ...early, lockedCard: null, deal: open }));
    expect(group(groups, "card").items.map((i) => i.status)).toEqual(["unverified", "missing", "missing"]);
    const { shown, skipped } = splitUnreached(groups, { state: "BLOCKED" });
    expect(shown.map((g) => g.id)).toEqual(["evidence"]);
    expect(skipped?.names).toBe("the item card, payment, shipping and delivery");
    expect(skipped?.because).toBe("This deal ended before the card was agreed, so no money moved.");
  });

  it("keeps the card group on a blocked deal whose card was half agreed", () => {
    const half = { ...cleanPs5.deal, state: "BLOCKED" as const, lockedCardVersion: null, sellerAgreedAt: null, buyerAgreedAt: "2026-10-09T09:00:00.000Z" };
    const { shown } = splitUnreached(dealStatusView(input({ ...early, lockedCard: null, deal: half })), { state: "BLOCKED" });
    expect(shown.map((g) => g.id)).toContain("card");
  });

  it("shows an unlocked card normally while the deal is still moving", () => {
    const open = { ...cleanPs5.deal, state: "REVIEWED" as const, lockedCardVersion: null, buyerAgreedAt: null, sellerAgreedAt: null };
    const { shown } = splitUnreached(dealStatusView(input({ ...early, lockedCard: null, deal: open })), { state: "REVIEWED" });
    expect(shown.map((g) => g.id)).toEqual(["card", "evidence"]);
  });

  it("says not yet, rather than ended, for a deal still working through it", () => {
    expect(splitUnreached(dealStatusView(input(early)), { state: "REVIEWED" }).skipped?.because).toBe("This deal has not reached payment yet.");
  });

  it("collapses nothing on a finished deal, because every stage was reached", () => {
    const groups = dealStatusView(input({ payment: cleanPs5.payment, shipment: cleanPs5.shipment, hasEvidence: true }));
    expect(splitUnreached(groups, { state: "COMPLETE" }).skipped).toBeNull();
  });

  it("keeps an empty stage the deal's state says happened, because that is a fault worth seeing", () => {
    // No payment on the deal, but the state says PAID. Collapsing it would hide exactly that.
    const { shown, skipped } = splitUnreached(dealStatusView(input()), { state: "PAID" });
    expect(shown.map((g) => g.id)).toContain("payment");
    expect(skipped).toBeNull();
  });

  it("never collapses a gap in the middle, only a trailing run", () => {
    const groups: StatusGroup[] = [
      { id: "card", title: "c", items: [{ id: "a", label: "a", status: "verified", detail: "detail" }] },
      { id: "payment", title: "p", items: [{ id: "b", label: "b", status: "missing", detail: "detail" }] },
      { id: "delivery", title: "d", items: [{ id: "c", label: "c", status: "verified", detail: "detail" }] },
    ];
    expect(splitUnreached(groups, { state: "DELIVERED" }).skipped).toBeNull();
    expect(splitUnreached(groups, { state: "DELIVERED" }).shown).toHaveLength(3);
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
    // Said once, beside the ids in the payment panel; the rows only show the id.
    const text = JSON.stringify(groups);
    expect(text).not.toMatch(/seeded example deal/);
    expect(item(groups, "payment", "order").detail).toMatch(/^Pay Pals recorded order \S+, status \w+\.$/);
    expect(item(groups, "payment", "capture").detail).toMatch(/^Pay Pals recorded capture \S+\.$/);
  });

  it("verifies nothing when the live read did not come back", () => {
    const groups = dealStatusView(input({ payment: { ...cleanPs5.payment!, paypalOrderId: "2NW245573K1279237" }, paypalRead: { kind: "failed" } }));
    for (const line of group(groups, "payment").items) expect(line.status, line.id).not.toBe("verified");
    expect(item(groups, "payment", "order").detail).toMatch(/live read of the order did not come back/);
  });

  it("flags an amount or payee that disagrees with the locked card", () => {
    const order = liveOrder({
      amount: { currency_code: "USD", value: "999.00" },
      payee: { email_address: "someone.else@example.com" },
      payments: { captures: [{ id: "C", status: "COMPLETED", amount: { currency_code: "USD", value: "999.00" } }] },
    });
    const line = item(dealStatusView(input({ payment: cleanPs5.payment, paypalRead: { kind: "confirmed", order } })), "payment", "amount-payee");
    expect(line.status).toBe("flagged");
    expect(line.detail).toMatch(/the amount and the payee does not agree/);
  });

  it("flags the hash when the stored events do not reproduce it", () => {
    const order = liveOrder({ custom_id: buildCustomId(cleanPs5.deal.id, "f".repeat(64)) });
    expect(item(dealStatusView(input({ payment: cleanPs5.payment, paypalRead: { kind: "confirmed", order } })), "payment", "history-hash").status).toBe("flagged");
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

  it("flags a checklist with a required step left undone", () => {
    const checklist = [{ id: "a", label: "Photograph the serial", required: true, done: false }];
    const line = item(dealStatusView(input({ shipment: { ...shipment, checklist } })), "shipping", "checklist");
    expect(line.status).toBe("flagged");
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
      outcome: "match" as const,
      mismatches: [],
      observed: { brand: "Sony", model: "PlayStation 5", serial: "AJ164952580" },
      palMessage: "It is the same console.",
      createdAt: "2026-10-09T12:30:00.000Z",
    };
    const line = item(dealStatusView(input({ arrivalCheck: check })), "delivery", "arrival-check");
    expect(line.status).toBe("verified");
    expect(line.detail).toMatch(new RegExp(`locked card version ${lockedCard.version}`));
    expect(line.detail).toMatch(/compared the arrival photos against/);
  });

  it("says where the serial came from, from observed.serialSource and nowhere else", () => {
    const base = {
      dealId: cleanPs5.deal.id,
      cardVersion: lockedCard.version,
      outcome: "match" as const,
      mismatches: [],
      palMessage: "It is the same console.",
      createdAt: "2026-10-09T12:30:00.000Z",
    };
    const detailFor = (serialSource: "photo" | "description" | null | undefined) =>
      item(
        dealStatusView(input({ arrivalCheck: { ...base, observed: { brand: "Sony", model: "PlayStation 5", serial: "AJ164952580", serialSource } } })),
        "delivery",
        "arrival-check",
      ).detail;

    // Read off the picture: the pal saw it, so the line may say so.
    expect(detailFor("photo")).toContain("Serial AJ164952580 was read off the picture of the item itself.");

    // Out of the caption: the buyer's word, in the same terms the pal uses for it.
    const described = detailFor("description");
    expect(described).toContain("comes from the description filed with the photo, not from the picture");
    expect(described).toContain("the buyer's word and not a number the pal read");
    expect(described).not.toMatch(/read off the picture of the item/);

    // No source on the check: the number is named and no claim is made about where it came from.
    for (const unknown of [null, undefined] as const) {
      expect(detailFor(unknown), String(unknown)).toContain("This check does not record where that number came from.");
      // Not even the words to deny a read: with no source there is nothing to say either way.
      expect(detailFor(unknown), String(unknown)).not.toMatch(/read .{0,20}off|off the (photo|picture|image)/i);
    }
  });

  it("names no serial when the check carries none", () => {
    const check = {
      dealId: cleanPs5.deal.id,
      cardVersion: lockedCard.version,
      outcome: "match" as const,
      mismatches: [],
      observed: { brand: "Sony", model: "PlayStation 5", serial: null, serialSource: null },
      palMessage: "Nothing contradicts the card.",
      createdAt: "2026-10-09T12:30:00.000Z",
    };
    const line = item(dealStatusView(input({ arrivalCheck: check })), "delivery", "arrival-check");
    expect(line.detail).toBe(
      `The Buyer Pal compared the arrival photos against locked card version ${lockedCard.version} and found no difference from the item the card describes.`,
    );
  });

  it("flags an arrival check that found a difference, and names it", () => {
    const check = {
      dealId: cleanPs5.deal.id,
      cardVersion: lockedCard.version,
      outcome: "mismatch" as const,
      mismatches: [{ field: "serial" as const, expected: "AJ164952580", observed: "nothing in the box", explanation: "The box was empty." }],
      observed: { brand: null, model: null, serial: null },
      palMessage: "The console is not there.",
      createdAt: "2026-10-09T12:30:00.000Z",
    };
    const line = item(dealStatusView(input({ arrivalCheck: check })), "delivery", "arrival-check");
    expect(line.status).toBe("flagged");
    expect(line.detail).toContain("nothing in the box");
  });

  it("does not verify an arrival check it could not settle, and does not report it as a difference either", () => {
    const check = {
      dealId: cleanPs5.deal.id,
      cardVersion: lockedCard.version,
      outcome: "inconclusive" as const,
      // Empty on an inconclusive check, which is the trap: a branch counting this would say "0 differences".
      mismatches: [],
      unsettled: [
        {
          field: "serial" as const,
          expected: "AJ164952580",
          observed: "AJ16495258O",
          explanation: "They differ only at character 11, 0 against O.",
        },
      ],
      observed: { brand: "Sony", model: "PlayStation 5", serial: "AJ16495258O" },
      palMessage: "I cannot tell whether those are the same number.",
      createdAt: "2026-10-09T12:30:00.000Z",
    };
    const line = item(dealStatusView(input({ arrivalCheck: check })), "delivery", "arrival-check");

    // Unverified: a check that ran and did not settle is neither a pass nor a failure.
    expect(line.status).toBe("unverified");
    expect(line.detail).toMatch(/could not settle 1 comparison/);
    // Both numbers named, so a reader can see what the pal was looking at.
    expect(line.detail).toContain("AJ164952580");
    expect(line.detail).toContain("AJ16495258O");
    expect(line.detail).toContain("not calling that a match and not calling it a mismatch");
    expect(line.detail).toMatch(/clearer photo of that label/);
    // Never the mismatch wording, and never the empty-list artifact.
    expect(line.detail).not.toMatch(/found \d+ differences?/);
    expect(line.detail).not.toMatch(/0 differences|: \./);
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
