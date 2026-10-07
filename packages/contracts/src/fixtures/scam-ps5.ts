/**
 * Scenario 1: scam stopped. A seller offers a PlayStation 5 with its box for
 * 220 dollars, wants Friends and Family, reuses a photo from someone else's
 * real listing, and says he deploys Friday so it has to be today. The Buyer
 * Pal says stop. No order is ever created.
 */
import type { ScenarioFixture } from "./types";

const dealId = "11111111-1111-4111-8111-111111111111";
const t0 = "2026-10-20T14:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(t0) + minutes * 60_000).toISOString();

const seller = { role: "seller", displayName: "Tyler R.", email: "tyler.r.sells@example.com" } as const;
const buyer = { role: "buyer", displayName: "Dana M.", email: "dana.m@example.com" } as const;

const listingPhoto = {
  url: "/fixtures/scam-ps5/listing-reused.jpg",
  whatItShows: "Console and box on a couch. The same photo is reused from another seller's real listing.",
  addedBy: "seller",
  addedAt: at(0),
} as const;

export const scamPs5: ScenarioFixture = {
  id: "scam-ps5",
  name: "Scam stopped",
  summary:
    "A seller offers a PlayStation 5 with its box for $220, wants Friends and Family, reuses someone else's listing photo and says it has to be today. The Buyer Pal stops it before any money moves.",
  seller,
  buyer,
  deal: {
    id: dealId,
    state: "BLOCKED",
    scenario: "scam-ps5",
    seller,
    buyer,
    currentCardVersion: 1,
    lockedCardVersion: null,
    buyerAgreedAt: null,
    sellerAgreedAt: null,
    createdAt: at(0),
    updatedAt: at(25),
  },
  listingText:
    "PS5 disc edition with original box, controller and all cables. Like new. $220 FIRM. Need it gone TODAY, I deploy Friday. Serious buyers only. No lowballs.",
  sellerNotes: "Just pay and I ship. Everything in the photo is included.",
  listingPhotos: [listingPhoto],
  cards: [
    {
      dealId,
      version: 1,
      title: "Sony PlayStation 5 disc edition with box",
      brand: "Sony",
      model: "PlayStation 5 disc edition, CFI-1215A",
      serial: null,
      boxSerial: null,
      conditionGrade: "like_new",
      conditionNotes: "Seller says like new. One photo, reused from another listing. No serial on the console or the box label.",
      included: ["Console", "Controller", "Cables", "Box"],
      photos: [listingPhoto],
      askingPrice: 220,
      currency: "USD",
      sellerPaypalEmail: "quickcash.deals.2026@example.com",
      lockedAt: null,
    },
  ],
  chat: [
    { id: "m1", dealId, channel: "deal", author: "buyer", text: "Hi, is the PS5 still available?", photos: [], at: at(2) },
    { id: "m2", dealId, channel: "deal", author: "seller", text: "Yes but it has to be today. I deploy Friday and I am clearing everything out.", photos: [], at: at(3) },
    { id: "m3", dealId, channel: "deal", author: "buyer", text: "Can you send a photo of the serial on the back of the console and the box label?", photos: [], at: at(5) },
    { id: "m4", dealId, channel: "deal", author: "seller", text: "It is packed already, I am not unboxing it again. The photo in the listing is what you get.", photos: [], at: at(6) },
    { id: "m5", dealId, channel: "deal", author: "seller", text: "Send $220 as Friends and Family so I do not lose fees and I will ship tonight. Zelle works too.", photos: [], at: at(8) },
    { id: "m6", dealId, channel: "deal", author: "buyer", text: "Let me check with my pal first.", photos: [], at: at(9) },
    { id: "m7", dealId, channel: "deal", author: "seller", text: "I have three other people asking. First to pay gets it.", photos: [], at: at(10) },
  ],
  marketPrice: {
    marketLow: 380,
    marketHigh: 499,
    currency: "USD",
    provider: "fixture",
    checkedAt: at(12),
    sources: [
      { name: "Online marketplace listing, used, like new, with box", price: 395, condition: "like_new" },
      { name: "Online marketplace listing, used, good", price: 380, condition: "good" },
      { name: "Retailer, new", price: 499, condition: "new" },
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
    { id: "e2", dealId, kind: "card_updated", actor: "seller_pal", summary: "Seller Pal built card version 1. No serial found on the console or the box in the photo.", at: at(1) },
    { id: "e3", dealId, kind: "state_changed", actor: "system", summary: "Listed.", fromState: "DRAFT", toState: "LISTED", at: at(1) },
    { id: "e4", dealId, kind: "review_posted", actor: "buyer_pal", summary: "Buyer Pal reviewed the deal: stop.", at: at(12) },
    { id: "e5", dealId, kind: "state_changed", actor: "system", summary: "Reviewed.", fromState: "LISTED", toState: "REVIEWED", at: at(12) },
    { id: "e6", dealId, kind: "state_changed", actor: "buyer_pal", summary: "Blocked. Pay Pals will not move money outside a Goods and Services payment.", fromState: "REVIEWED", toState: "BLOCKED", at: at(25) },
  ],
};
