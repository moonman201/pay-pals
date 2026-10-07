/**
 * Scenario 1: scam stopped. A seller offers a Garmin Fenix 7 Pro for 180
 * dollars, wants Friends and Family, uses a product render, and pushes for
 * today. The Buyer Pal says stop. No order is ever created.
 */
import type { ScenarioFixture } from "./types";

const dealId = "11111111-1111-4111-8111-111111111111";
const t0 = "2026-10-20T14:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(t0) + minutes * 60_000).toISOString();

export const scamGarmin: ScenarioFixture = {
  id: "scam-garmin",
  name: "Scam stopped",
  summary:
    "A seller offers a Garmin Fenix 7 Pro for $180, wants Friends and Family, uses a product photo and says it has to be today. The Buyer Pal stops it before any money moves.",
  seller: { role: "seller", displayName: "Tyler R.", email: "tyler.r.sells@example.com" },
  buyer: { role: "buyer", displayName: "Dana M.", email: "dana.m@example.com" },
  deal: {
    id: dealId,
    state: "BLOCKED",
    scenario: "scam-garmin",
    seller: { role: "seller", displayName: "Tyler R.", email: "tyler.r.sells@example.com" },
    buyer: { role: "buyer", displayName: "Dana M.", email: "dana.m@example.com" },
    currentCardVersion: 1,
    lockedCardVersion: null,
    buyerAgreedAt: null,
    sellerAgreedAt: null,
    createdAt: at(0),
    updatedAt: at(25),
  },
  listingText:
    "Garmin Fenix 7 Pro Sapphire Solar. Brand new condition, barely worn. $180 FIRM. Need gone TODAY, I deploy Friday. Serious buyers only. No lowballs.",
  sellerNotes: "Just pay and I ship. Box and charger included.",
  listingPhotos: [
    {
      url: "/fixtures/scam-garmin/listing-render.jpg",
      whatItShows: "Front of the watch on a plain white background",
      addedBy: "seller",
      addedAt: at(0),
    },
  ],
  cards: [
    {
      dealId,
      version: 1,
      title: "Garmin Fenix 7 Pro Sapphire Solar",
      brand: "Garmin",
      model: "Fenix 7 Pro Sapphire Solar 47mm",
      serial: null,
      conditionGrade: "like_new",
      conditionNotes: "Seller says barely worn. No photos of the actual unit, no serial.",
      included: ["Box", "Charging cable"],
      photos: [
        {
          url: "/fixtures/scam-garmin/listing-render.jpg",
          whatItShows: "Front of the watch on a plain white background",
          addedBy: "seller",
          addedAt: at(0),
        },
      ],
      askingPrice: 180,
      currency: "USD",
      sellerPaypalEmail: "quickcash.deals.2026@example.com",
      lockedAt: null,
    },
  ],
  chat: [
    { id: "m1", dealId, channel: "deal", author: "buyer", text: "Hi, is the Fenix 7 Pro still available?", photos: [], at: at(2) },
    { id: "m2", dealId, channel: "deal", author: "seller", text: "Yes but it has to be today. I deploy Friday and I am clearing everything out.", photos: [], at: at(3) },
    { id: "m3", dealId, channel: "deal", author: "buyer", text: "Can you send a photo of the back with the serial number?", photos: [], at: at(5) },
    { id: "m4", dealId, channel: "deal", author: "seller", text: "It is still sealed in the box, I do not want to open it. The photo in the listing is what you get.", photos: [], at: at(6) },
    { id: "m5", dealId, channel: "deal", author: "seller", text: "Send $180 as Friends and Family so I do not lose fees and I will ship tonight. Zelle works too.", photos: [], at: at(8) },
    { id: "m6", dealId, channel: "deal", author: "buyer", text: "Let me check with my pal first.", photos: [], at: at(9) },
    { id: "m7", dealId, channel: "deal", author: "seller", text: "I have three other people asking. First to pay gets it.", photos: [], at: at(10) },
  ],
  marketPrice: {
    marketLow: 420,
    marketHigh: 560,
    currency: "USD",
    provider: "fixture",
    checkedAt: at(12),
    sources: [
      { name: "Online marketplace listing, used, like new", price: 445, condition: "like_new" },
      { name: "Online marketplace listing, used, good", price: 425, condition: "good" },
      { name: "Retailer, open box", price: 549, condition: "like_new" },
    ],
  },
  expectedVerdict: {
    overall: "stop",
    requiredFlags: ["FRIENDS_AND_FAMILY_REQUEST", "PRICE_FAR_BELOW_MARKET", "URGENCY_PRESSURE"],
    optionalFlags: ["OFF_PLATFORM_PAYMENT", "STOCK_OR_REUSED_PHOTO", "MISSING_SERIAL", "NAME_MISMATCH"],
    forbiddenSeverity: null,
  },
  payment: null,
  shipment: null,
  arrivalPhotos: [],
  expectedArrival: null,
  timeline: [
    { id: "e1", dealId, kind: "deal_created", actor: "seller", summary: "Tyler R. started a deal.", at: at(0) },
    { id: "e2", dealId, kind: "card_updated", actor: "seller_pal", summary: "Seller Pal built card version 1. No serial found in the photos.", at: at(1) },
    { id: "e3", dealId, kind: "state_changed", actor: "system", summary: "Listed.", fromState: "DRAFT", toState: "LISTED", at: at(1) },
    { id: "e4", dealId, kind: "review_posted", actor: "buyer_pal", summary: "Buyer Pal reviewed the deal: stop.", at: at(12) },
    { id: "e5", dealId, kind: "state_changed", actor: "system", summary: "Reviewed.", fromState: "LISTED", toState: "REVIEWED", at: at(12) },
    { id: "e6", dealId, kind: "state_changed", actor: "buyer_pal", summary: "Blocked. Pay Pals will not move money outside a Goods and Services payment.", fromState: "REVIEWED", toState: "BLOCKED", at: at(25) },
  ],
};
