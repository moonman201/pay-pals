import { describe, expect, it } from "vitest";
import { cleanPs5, emptyBox, scamPs5 } from "@pay-pals/contracts";
import { friendsAndFamilyRule } from "./friends-and-family";
import { offPlatformRule } from "./off-platform";
import { priceBelowMarketRule } from "./price-below-market";
import { urgencyRule } from "./urgency";
import { missingSerialRule } from "./missing-serial";
import { shipBeforePayRule } from "./ship-before-pay";
import { nameMismatchRule } from "./name-mismatch";
import { stockPhotoRule } from "./stock-photo";
import { boxSerialMismatchRule } from "./box-serial-mismatch";
import { overallFromFlags, runRules } from "./index";
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
  it("cautions when the card has no serial", () => {
    expect(missingSerialRule({ card: card({ serial: null }), chat: [], priceCheck: price })[0]).toMatchObject({ code: "MISSING_SERIAL", severity: "caution" });
  });
  it("is quiet when the serial is present", () => {
    expect(missingSerialRule({ card: card(), chat: [], priceCheck: price })).toHaveLength(0);
  });
});

describe("boxSerialMismatchRule", () => {
  it("cautions with both serials when the box label differs from the item", () => {
    const flags = boxSerialMismatchRule({ card: card({ serial: "AH912345678", boxSerial: "AH900000001" }), chat: [], priceCheck: price });
    expect(flags[0]).toMatchObject({ code: "OTHER", severity: "caution", evidence: "serial: AH912345678, boxSerial: AH900000001" });
  });
  it("is quiet when they match, ignoring case and dashes, or when either is missing", () => {
    expect(boxSerialMismatchRule({ card: card({ serial: "AH912345678", boxSerial: "ah9-1234-5678" }), chat: [], priceCheck: price })).toHaveLength(0);
    expect(boxSerialMismatchRule({ card: card({ serial: "AH912345678", boxSerial: null }), chat: [], priceCheck: price })).toHaveLength(0);
    expect(boxSerialMismatchRule({ card: card({ serial: null, boxSerial: "AH912345678" }), chat: [], priceCheck: price })).toHaveLength(0);
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
  it("cautions when every photo is catalog style or reused from another listing", () => {
    expect(stockPhotoRule({ card: scamPs5.cards[0]!, chat: [], priceCheck: price })[0]).toMatchObject({ code: "STOCK_OR_REUSED_PHOTO", severity: "caution" });
    const stock = card({ photos: [{ url: "/x.jpg", whatItShows: "Console on a plain white background", addedBy: "seller" }] });
    expect(stockPhotoRule({ card: stock, chat: [], priceCheck: price })).toHaveLength(1);
  });
  it("is quiet when a photo shows the actual unit", () => {
    expect(stockPhotoRule({ card: card(), chat: [], priceCheck: price })).toHaveLength(0);
  });
});

describe("runRules on the fixtures", () => {
  it("scam-ps5 raises the required flags and stops", () => {
    const flags = runRules({ card: scamPs5.cards.at(-1)!, chat: scamPs5.chat, priceCheck: scamPs5.marketPrice, seller: scamPs5.seller });
    const codes = flags.map((f) => f.code);
    for (const required of scamPs5.expectedVerdict.requiredFlags) expect(codes).toContain(required);
    expect(codes).toContain("OFF_PLATFORM_PAYMENT");
    expect(codes).toContain("NAME_MISMATCH");
    expect(codes).toContain("STOCK_OR_REUSED_PHOTO");
    const allowed = new Set([...scamPs5.expectedVerdict.requiredFlags, ...scamPs5.expectedVerdict.optionalFlags]);
    for (const code of codes) expect(allowed.has(code), code).toBe(true);
    expect(overallFromFlags(flags)).toBe("stop");
    expect(flags.every((f) => f.raisedByRule)).toBe(true);
  });
  it("clean-ps5 and empty-box raise nothing", () => {
    for (const fixture of [cleanPs5, emptyBox]) {
      const flags = runRules({ card: fixture.cards.at(-1)!, chat: fixture.chat, priceCheck: fixture.marketPrice, seller: fixture.seller });
      expect(flags, fixture.id).toHaveLength(0);
      expect(overallFromFlags(flags)).toBe("go");
    }
  });
});
