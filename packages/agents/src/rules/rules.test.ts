import { describe, expect, it } from "vitest";
import { cleanGarmin, scamGarmin, wrongItem } from "@pay-pals/contracts";
import { friendsAndFamilyRule } from "./friends-and-family";
import { offPlatformRule } from "./off-platform";
import { priceBelowMarketRule } from "./price-below-market";
import { urgencyRule } from "./urgency";
import { missingSerialRule } from "./missing-serial";
import { shipBeforePayRule } from "./ship-before-pay";
import { nameMismatchRule } from "./name-mismatch";
import { stockPhotoRule } from "./stock-photo";
import { overallFromFlags, runRules } from "./index";
import { card, says } from "../testing/builders";

const price = cleanGarmin.marketPrice;

describe("friendsAndFamilyRule", () => {
  it("flags a seller asking for Friends and Family", () => {
    const flags = friendsAndFamilyRule({ card: card(), chat: [says("seller", "Send it as friends and family so I do not lose fees.")], priceCheck: price });
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ code: "FRIENDS_AND_FAMILY_REQUEST", severity: "stop", raisedByRule: true });
    expect(flags[0]!.evidence).toContain("friends and family");
  });
  it("flags F&F shorthand and asking to skip Goods and Services", () => {
    expect(friendsAndFamilyRule({ card: card(), chat: [says("seller", "F&F only please")], priceCheck: price })).toHaveLength(1);
    expect(friendsAndFamilyRule({ card: card(), chat: [says("seller", "please do not use goods and services, it costs me")], priceCheck: price })).toHaveLength(1);
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
    const flags = priceBelowMarketRule({ card: card({ askingPrice: 180 }), chat: [], priceCheck: price });
    expect(flags[0]).toMatchObject({ code: "PRICE_FAR_BELOW_MARKET", severity: "stop" });
    expect(flags[0]!.evidence).toContain("$180");
    expect(flags[0]!.evidence).toContain("$420");
  });
  it("cautions between 60% and 75% of the market low", () => {
    expect(priceBelowMarketRule({ card: card({ askingPrice: 300 }), chat: [], priceCheck: price })[0]!.severity).toBe("caution");
  });
  it("raises nothing at a fair price, with no price check, or with an unknown market", () => {
    expect(priceBelowMarketRule({ card: card({ askingPrice: 475 }), chat: [], priceCheck: price })).toHaveLength(0);
    expect(priceBelowMarketRule({ card: card({ askingPrice: 180 }), chat: [], priceCheck: null })).toHaveLength(0);
    expect(priceBelowMarketRule({ card: card({ askingPrice: 180 }), chat: [], priceCheck: { ...price, marketLow: 0, marketHigh: 0 } })).toHaveLength(0);
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
  it("does not flag a seller explaining a move or deployment", () => {
    const chat = [
      says("seller", "PCS orders came through and I am moving next month so it needs a new home."),
      says("seller", "I deploy Friday, happy to answer questions before then."),
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
    expect(nameMismatchRule({ card: card({ sellerPaypalEmail: "luis.o@example.com" }), chat: [], priceCheck: price, seller: { displayName: "Luis O.", email: "luis.o@example.com" } })).toHaveLength(0);
    expect(nameMismatchRule({ card: card({ sellerPaypalEmail: "lo.watches@example.com" }), chat: [], priceCheck: price, seller: { displayName: "Luis O.", email: "lo.watches@example.com" } })).toHaveLength(0);
  });
  it("stays quiet when the seller identity is not supplied", () => {
    expect(nameMismatchRule({ card: card({ sellerPaypalEmail: "quickcash@example.com" }), chat: [], priceCheck: price })).toHaveLength(0);
  });
});

describe("stockPhotoRule", () => {
  it("cautions when every photo is catalog style", () => {
    expect(stockPhotoRule({ card: scamGarmin.cards[0]!, chat: [], priceCheck: price })[0]).toMatchObject({ code: "STOCK_OR_REUSED_PHOTO", severity: "caution" });
  });
  it("is quiet when a photo shows the actual unit", () => {
    expect(stockPhotoRule({ card: card(), chat: [], priceCheck: price })).toHaveLength(0);
  });
});

describe("runRules on the fixtures", () => {
  it("scam-garmin raises the required flags and stops", () => {
    const flags = runRules({ card: scamGarmin.cards.at(-1)!, chat: scamGarmin.chat, priceCheck: scamGarmin.marketPrice, seller: scamGarmin.seller });
    const codes = flags.map((f) => f.code);
    for (const required of scamGarmin.expectedVerdict.requiredFlags) expect(codes).toContain(required);
    expect(codes).toContain("OFF_PLATFORM_PAYMENT");
    expect(codes).toContain("NAME_MISMATCH");
    const allowed = new Set([...scamGarmin.expectedVerdict.requiredFlags, ...scamGarmin.expectedVerdict.optionalFlags]);
    for (const code of codes) expect(allowed.has(code), code).toBe(true);
    expect(overallFromFlags(flags)).toBe("stop");
    expect(flags.every((f) => f.raisedByRule)).toBe(true);
  });
  it("clean-garmin and wrong-item raise nothing", () => {
    for (const fixture of [cleanGarmin, wrongItem]) {
      const flags = runRules({ card: fixture.cards.at(-1)!, chat: fixture.chat, priceCheck: fixture.marketPrice, seller: fixture.seller });
      expect(flags, fixture.id).toHaveLength(0);
      expect(overallFromFlags(flags)).toBe("go");
    }
  });
});
