import { describe, expect, it } from "vitest";
import { FAKE_SLAB_CERT, cleanPs5, emptyBox, fakeSlab } from "@pay-pals/contracts";
import { friendsAndFamilyRule } from "./friends-and-family";
import { offPlatformRule } from "./off-platform";
import { priceBelowMarketRule } from "./price-below-market";
import { urgencyRule } from "./urgency";
import { missingSerialRule } from "./missing-serial";
import { shipBeforePayRule } from "./ship-before-pay";
import { nameMismatchRule } from "./name-mismatch";
import { stockPhotoRule } from "./stock-photo";
import { boxSerialMismatchRule } from "./box-serial-mismatch";
import { inviteRefusedRule } from "./invite-refused";
import { certMismatchRule } from "./cert-mismatch";
import { CARD_RULES, overallFromFlags, runRules } from "./index";
import { card, says } from "../testing/builders";

const price = cleanPs5.marketPrice;

describe("friendsAndFamilyRule", () => {
  it("flags a seller asking for Friends and Family", () => {
    const flags = friendsAndFamilyRule({ card: card(), chat: [says("seller", "Send it as friends and family so I do not lose fees.")], priceCheck: price });
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ code: "FRIENDS_AND_FAMILY_REQUEST", severity: "stop", raisedByRule: true });
    expect(flags[0]!.evidence).toContain("friends and family");
  });
  it("flags F&F shorthand, the ampersand and slash forms, and asking to skip Goods and Services", () => {
    for (const text of [
      "F&F only please",
      "first to send Friends & Family gets it.",
      "Send it as Friends & Family or Zelle in the next hour or it goes to the next person.",
      "friends/family only",
      "please do not use goods and services, it costs me",
    ]) {
      expect(friendsAndFamilyRule({ card: card(), chat: [says("seller", text)], priceCheck: price }), text).toHaveLength(1);
    }
  });
  it("ignores a buyer saying they will only pay Goods and Services", () => {
    expect(friendsAndFamilyRule({ card: card(), chat: [says("buyer", "I only pay goods and services, never friends and family.")], priceCheck: price })).toHaveLength(0);
  });
  it("ignores a seller describing a family gift", () => {
    expect(friendsAndFamilyRule({ card: card(), chat: [says("seller", "My family gave it to me last year.")], priceCheck: price })).toHaveLength(0);
  });
});

describe("inviteRefusedRule", () => {
  it("fires on the record of a declined invite", () => {
    const flags = inviteRefusedRule({ card: null, chat: [], priceCheck: null, inviteDeclined: true });
    expect(flags[0]).toMatchObject({ code: "INVITE_REFUSED", severity: "stop", evidence: "The seller declined the Pay Pals invite" });
  });
  it("fires on a seller refusing the invite or insisting on an unprotected method", () => {
    for (const text of [
      "Friends & Family only.",
      "F&F only, take it or leave it.",
      "Not doing that app, just send the money.",
      "I only take F&F or Zelle.",
      "I only accept Cash App.",
      "Don't need protection, I have sold plenty.",
      "No thanks, I am not clicking any link.",
      "Zelle only.",
    ]) {
      const flags = inviteRefusedRule({ card: null, chat: [says("seller", text)], priceCheck: null });
      expect(flags, text).toHaveLength(1);
      expect(flags[0]!.evidence).toContain(text.replace(/\.$/, "").slice(0, 20));
    }
  });
  it("does not fire on a seller who joined, or on the buyer", () => {
    expect(inviteRefusedRule({ card: null, chat: [says("seller", "I joined, uploading photos now.")], priceCheck: null })).toHaveLength(0);
    expect(inviteRefusedRule({ card: null, chat: [says("seller", "Sure, the app looks fine. Give me a minute.")], priceCheck: null })).toHaveLength(0);
    expect(inviteRefusedRule({ card: null, chat: [says("buyer", "I only take F&F from friends, not here.")], priceCheck: null })).toHaveLength(0);
    expect(inviteRefusedRule({ card: fakeSlab.cards[0]!, chat: fakeSlab.chat, priceCheck: null })).toHaveLength(0);
  });
});

describe("offPlatformRule", () => {
  it("flags Zelle, Cash App, gift cards and crypto", () => {
    for (const text of ["Zelle works too.", "cash app is easier", "I take gift cards", "bitcoin only"]) {
      expect(offPlatformRule({ card: card(), chat: [says("seller", text)], priceCheck: price }), text).toHaveLength(1);
      expect(offPlatformRule({ card: card(), chat: [says("seller", text)], priceCheck: price })[0]!.severity).toBe("stop");
    }
  });
  it("flags Venmo sent directly but not Venmo as a checkout option", () => {
    expect(offPlatformRule({ card: card(), chat: [says("seller", "Just venmo me and I ship")], priceCheck: price })).toHaveLength(1);
    expect(offPlatformRule({ card: card(), chat: [says("seller", "Venmo friends mode so no fees")], priceCheck: price })).toHaveLength(1);
    expect(offPlatformRule({ card: card(), chat: [says("seller", "PayPal or Venmo through the checkout is fine with me.")], priceCheck: price })).toHaveLength(0);
  });
  it("ignores the buyer mentioning Zelle", () => {
    expect(offPlatformRule({ card: card(), chat: [says("buyer", "I will not use Zelle.")], priceCheck: price })).toHaveLength(0);
  });
});

describe("priceBelowMarketRule", () => {
  it("stops when the ask is under 60% of the market low", () => {
    const flags = priceBelowMarketRule({ card: card({ askingPrice: 220 }), chat: [], priceCheck: price });
    expect(flags[0]).toMatchObject({ code: "PRICE_FAR_BELOW_MARKET", severity: "stop" });
    expect(flags[0]!.evidence).toContain("$220");
    expect(flags[0]!.evidence).toContain("$380");
  });
  it("cautions between 60% and 75% of the market low", () => {
    expect(priceBelowMarketRule({ card: card({ askingPrice: 260 }), chat: [], priceCheck: price })[0]!.severity).toBe("caution");
  });
  it("raises nothing at a fair price, with no price check, or with an unknown market", () => {
    expect(priceBelowMarketRule({ card: card({ askingPrice: 420 }), chat: [], priceCheck: price })).toHaveLength(0);
    expect(priceBelowMarketRule({ card: card({ askingPrice: 410 }), chat: [], priceCheck: price })).toHaveLength(0);
    expect(priceBelowMarketRule({ card: card({ askingPrice: 220 }), chat: [], priceCheck: null })).toHaveLength(0);
    expect(priceBelowMarketRule({ card: card({ askingPrice: 220 }), chat: [], priceCheck: { ...price, marketLow: 0, marketHigh: 0 } })).toHaveLength(0);
  });
});

describe("urgencyRule", () => {
  it("flags has to be today plus first to pay", () => {
    const flags = urgencyRule({
      card: card(),
      chat: [says("seller", "Yes but it has to be today."), says("seller", "I have three other people asking. First to pay gets it.")],
      priceCheck: price,
    });
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ code: "URGENCY_PRESSURE", severity: "caution" });
    expect(flags[0]!.evidence).toContain("has to be today");
    expect(flags[0]!.evidence).toContain("First to pay");
  });
  it("flags each line of the scam script on its own", () => {
    for (const text of [
      "I'm moving out of state tomorrow and have three other people interested, first to send Friends & Family gets it.",
      "first to send Friends & Family gets it",
      "I have three other people interested.",
      "Send it in the next hour.",
      "Pay now or it goes to the next person.",
      "No time for that.",
    ]) {
      const flags = urgencyRule({ card: card(), chat: [says("seller", text)], priceCheck: price });
      expect(flags, text).toHaveLength(1);
      expect(flags[0]!.severity).toBe("caution");
    }
  });
  it("does not flag a seller talking about their own move", () => {
    const chat = [
      says("seller", "I'm moving out of state tomorrow."),
      says("seller", "New job came through and I am moving next month so it needs a new home."),
      says("seller", "I leave Friday, happy to answer questions before then."),
    ];
    expect(urgencyRule({ card: card(), chat, priceCheck: price })).toHaveLength(0);
  });
  it("ignores the buyer being in a hurry", () => {
    expect(urgencyRule({ card: card(), chat: [says("buyer", "I need it today, can you ship now?")], priceCheck: price })).toHaveLength(0);
  });
});

describe("missingSerialRule", () => {
  it("cautions when the card carries no number at all", () => {
    expect(missingSerialRule({ card: card({ serial: null, boxSerial: null }), chat: [], priceCheck: price })[0]).toMatchObject({ code: "MISSING_SERIAL", severity: "caution" });
  });
  it("is quiet for a serial on the item, a number off the box label, or a graded slab with a cert", () => {
    expect(missingSerialRule({ card: card({ serial: "AJ164952580" }), chat: [], priceCheck: price })).toHaveLength(0);
    // clean-ps5 card version 1: the box label has the number, the console's own sticker is not readable yet.
    expect(cleanPs5.cards[0]!.serial).toBeNull();
    expect(missingSerialRule({ card: cleanPs5.cards[0]!, chat: [], priceCheck: price })).toHaveLength(0);
    expect(missingSerialRule({ card: fakeSlab.cards[0]!, chat: [], priceCheck: price })).toHaveLength(0);
  });
});

describe("certMismatchRule", () => {
  const differentCard = { ...fakeSlab.certRecord!, subject: "2019 P.M. JPN. SUN & MOON PIKACHU & ZEKROM GX #054", grade: "7", year: "2019" };

  it("stops when the grader's record is a different card, or when there is no record", () => {
    const flags = certMismatchRule({ card: fakeSlab.cards[0]!, chat: [], priceCheck: null, certRecord: differentCard });
    expect(flags[0]).toMatchObject({ code: "CERT_MISMATCH", severity: "stop", raisedByRule: true });
    expect(flags[0]!.evidence).toContain(FAKE_SLAB_CERT);
    expect(flags[0]!.evidence).toContain("2019 P.M. JPN. SUN & MOON PIKACHU & ZEKROM GX #054");
    const none = certMismatchRule({ card: fakeSlab.cards[0]!, chat: [], priceCheck: null, certRecord: { ...fakeSlab.certRecord!, provider: "psa", subject: null, grade: null, year: null, brand: null } });
    expect(none[0]!.explanation).toContain(`PSA has no record for cert ${FAKE_SLAB_CERT}`);
  });
  it("raises nothing for a cert that was never looked up (fixture provider, no fixture record)", () => {
    const notChecked = { ...fakeSlab.certRecord!, certNumber: "49172834", subject: null, grade: null, year: null, brand: null, raw: { notChecked: true } };
    expect(certMismatchRule({ card: { ...fakeSlab.cards[0]!, certNumber: "49172834" }, chat: [], priceCheck: null, certRecord: notChecked })).toHaveLength(0);
  });
  it("is quiet on a match, without a record, or without a cert on the card", () => {
    // The fixture record is the real one for this cert and it matches the card.
    expect(certMismatchRule({ card: fakeSlab.cards[0]!, chat: [], priceCheck: null, certRecord: fakeSlab.certRecord })).toHaveLength(0);
    expect(certMismatchRule({ card: fakeSlab.cards[0]!, chat: [], priceCheck: null, certRecord: null })).toHaveLength(0);
    expect(certMismatchRule({ card: card(), chat: [], priceCheck: null, certRecord: differentCard })).toHaveLength(0);
  });
});

describe("boxSerialMismatchRule", () => {
  it("cautions with both serials when the box label differs from the item", () => {
    const flags = boxSerialMismatchRule({ card: card({ serial: "AJ164952580", boxSerial: "AJ100000001" }), chat: [], priceCheck: price });
    expect(flags[0]).toMatchObject({ code: "OTHER", severity: "caution", evidence: "Serial on the item AJ164952580; serial on the box label AJ100000001" });
  });
  it("is quiet when they match, ignoring case and dashes, or when either is missing", () => {
    expect(boxSerialMismatchRule({ card: card({ serial: "AJ164952580", boxSerial: "aj1-6495-2580" }), chat: [], priceCheck: price })).toHaveLength(0);
    expect(boxSerialMismatchRule({ card: card({ serial: "AJ164952580", boxSerial: null }), chat: [], priceCheck: price })).toHaveLength(0);
    expect(boxSerialMismatchRule({ card: card({ serial: null, boxSerial: "AJ164952580" }), chat: [], priceCheck: price })).toHaveLength(0);
  });
});

describe("shipBeforePayRule", () => {
  it("flags mark as received, deposits and separate shipping fees", () => {
    for (const text of [
      "Mark it as received once you pay and I will ship right after.",
      "Send a $50 deposit to hold it.",
      "Pay the shipping fee separately and the rest through PayPal.",
      "Release the payment first, then I ship.",
    ]) {
      const flags = shipBeforePayRule({ card: card(), chat: [says("seller", text)], priceCheck: price });
      expect(flags, text).toHaveLength(1);
      expect(flags[0]!.severity).toBe("stop");
    }
  });
  it("does not flag pay and I ship", () => {
    expect(shipBeforePayRule({ card: card(), chat: [says("seller", "Just pay and I ship tonight. Shipping is included in the price.")], priceCheck: price })).toHaveLength(0);
  });
});

describe("nameMismatchRule", () => {
  it("cautions when the PayPal account does not look like the seller", () => {
    const flags = nameMismatchRule({
      card: card({ sellerPaypalEmail: "quickcash.deals.2026@example.com" }),
      chat: [],
      priceCheck: price,
      seller: { displayName: "Tyler R.", email: "tyler.r.sells@example.com" },
    });
    expect(flags[0]).toMatchObject({ code: "NAME_MISMATCH", severity: "caution" });
  });
  it("accepts a PayPal email carrying the seller's name or matching their contact email", () => {
    expect(nameMismatchRule({ card: card({ sellerPaypalEmail: "matt.m@example.com" }), chat: [], priceCheck: price, seller: { displayName: "Matt M.", email: "matt.m@example.com" } })).toHaveLength(0);
    expect(nameMismatchRule({ card: card({ sellerPaypalEmail: "mm.consoles@example.com" }), chat: [], priceCheck: price, seller: { displayName: "Matt M.", email: "mm.consoles@example.com" } })).toHaveLength(0);
  });
  it("stays quiet when the seller identity is not supplied", () => {
    expect(nameMismatchRule({ card: card({ sellerPaypalEmail: "quickcash@example.com" }), chat: [], priceCheck: price })).toHaveLength(0);
  });
});

describe("stockPhotoRule", () => {
  it("cautions when the image check found the same picture elsewhere, naming the source", () => {
    const photo = fakeSlab.cards[0]!.photos[0]!;
    const flags = stockPhotoRule({ card: fakeSlab.cards[0]!, chat: [], priceCheck: price, photoMatches: [{ photo, source: "the reference set (slab-front.jpg)", distance: 3 }] });
    expect(flags[0]).toMatchObject({ code: "STOCK_OR_REUSED_PHOTO", severity: "caution" });
    expect(flags[0]!.evidence).toContain("the reference set (slab-front.jpg)");
    expect(flags[0]!.evidence).toContain("differ by 3 of 64 bits");
  });
  it("never fires from caption words alone, and is silent with no matches", () => {
    expect(stockPhotoRule({ card: fakeSlab.cards[0]!, chat: [], priceCheck: price })).toHaveLength(0);
    const stock = card({ photos: [{ url: "/x.jpg", whatItShows: "Console on a plain white background, a stock photo reused from another listing", addedBy: "seller" }] });
    expect(stockPhotoRule({ card: stock, chat: [], priceCheck: price, photoMatches: [] })).toHaveLength(0);
  });
});

describe("card rules with no card", () => {
  it("every card rule returns nothing", () => {
    for (const rule of CARD_RULES) expect(rule({ card: null, chat: fakeSlab.chat, priceCheck: price, seller: fakeSlab.seller, certRecord: fakeSlab.certRecord })).toEqual([]);
  });
});

describe("runRules on the fixtures", () => {
  it("fake-slab raises the required flags, one payment flag, and stops", () => {
    const flags = runRules({ card: fakeSlab.cards.at(-1)!, chat: fakeSlab.chat, priceCheck: fakeSlab.marketPrice, seller: fakeSlab.seller, certRecord: fakeSlab.certRecord });
    const codes = flags.map((f) => f.code);
    for (const required of fakeSlab.expectedVerdict.requiredFlags) expect(codes).toContain(required);
    expect(codes).not.toContain("OFF_PLATFORM_PAYMENT");
    expect(codes).not.toContain("STOCK_OR_REUSED_PHOTO");
    expect(codes.filter((c) => c === "FRIENDS_AND_FAMILY_REQUEST" || c === "OFF_PLATFORM_PAYMENT" || c === "INVITE_REFUSED")).toHaveLength(1);
    const payment = flags.find((f) => f.code === "FRIENDS_AND_FAMILY_REQUEST")!;
    expect(payment.explanation).toContain("Friends and Family or payment outside PayPal");
    expect(payment.evidence).toContain("Friends and Family");
    const allowed = new Set([...fakeSlab.expectedVerdict.requiredFlags, ...fakeSlab.expectedVerdict.optionalFlags]);
    for (const code of codes) expect(allowed.has(code), code).toBe(true);
    expect(overallFromFlags(flags)).toBe("stop");
    expect(flags.every((f) => f.raisedByRule)).toBe(true);
  });
  it("clean-ps5 and empty-box raise nothing", () => {
    for (const fixture of [cleanPs5, emptyBox]) {
      const flags = runRules({ card: fixture.cards.at(-1)!, chat: fixture.chat, priceCheck: fixture.marketPrice, seller: fixture.seller, certRecord: fixture.certRecord });
      expect(flags, fixture.id).toHaveLength(0);
      expect(overallFromFlags(flags)).toBe("go");
    }
  });
});
