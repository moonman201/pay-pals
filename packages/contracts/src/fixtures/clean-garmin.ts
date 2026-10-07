/**
 * Scenario 2: clean deal. A Marine sells a Garmin Fenix 7 Pro before a move.
 * Seller Pal reads the serial from the caseback photo. Buyer Pal confirms the
 * price and asks for a battery health photo. Seller adds it (card version 2).
 * Both agree, buyer pays, seller ships, buyer confirms. Complete.
 */
import type { ScenarioFixture } from "./types";
import type { ItemCard } from "../item-card";

const dealId = "22222222-2222-4222-8222-222222222222";
const t0 = "2026-10-21T16:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(t0) + minutes * 60_000).toISOString();

export const CLEAN_SERIAL = "7LP045912";

const seller = { role: "seller", displayName: "Luis O.", email: "luis.o@example.com" } as const;
const buyer = { role: "buyer", displayName: "Priya S.", email: "priya.s@example.com" } as const;

const casebackPhoto = {
  url: "/fixtures/clean-garmin/caseback-serial.jpg",
  whatItShows: `Back of the watch. Serial ${CLEAN_SERIAL} visible under the sensor.`,
  addedBy: "seller",
  addedAt: at(0),
} as const;

const frontPhoto = {
  url: "/fixtures/clean-garmin/front-on-wrist.jpg",
  whatItShows: "Front of the watch on the seller's wrist, screen on, light scuff on the bezel at 2 o'clock.",
  addedBy: "seller",
  addedAt: at(0),
} as const;

const batteryPhoto = {
  url: "/fixtures/clean-garmin/battery-page.jpg",
  whatItShows: "Watch battery page showing 11 days remaining in smartwatch mode.",
  addedBy: "seller",
  addedAt: at(40),
} as const;

const cardV1: ItemCard = {
  dealId,
  version: 1,
  title: "Garmin Fenix 7 Pro Sapphire Solar 47mm",
  brand: "Garmin",
  model: "Fenix 7 Pro Sapphire Solar 47mm",
  serial: CLEAN_SERIAL,
  conditionGrade: "good",
  conditionNotes: "Worn daily for about a year. Light scuff on the bezel at 2 o'clock, screen clear, no scratches on the glass.",
  included: ["Watch", "Charging cable", "Original box"],
  photos: [casebackPhoto, frontPhoto],
  askingPrice: 475,
  currency: "USD",
  sellerPaypalEmail: "luis.o@example.com",
  lockedAt: null,
};

const cardV2: ItemCard = {
  ...cardV1,
  version: 2,
  conditionNotes: cardV1.conditionNotes + " Battery holds about 11 days in smartwatch mode.",
  photos: [casebackPhoto, frontPhoto, batteryPhoto],
  lockedAt: at(60),
};

export const cleanGarmin: ScenarioFixture = {
  id: "clean-garmin",
  name: "Clean deal",
  summary:
    "A Marine sells a Garmin Fenix 7 Pro before a move. Seller Pal reads the serial, Buyer Pal confirms the price, both agree, the buyer pays with PayPal and the watch arrives as described.",
  seller,
  buyer,
  deal: {
    id: dealId,
    state: "COMPLETE",
    scenario: "clean-garmin",
    seller,
    buyer,
    currentCardVersion: 2,
    lockedCardVersion: 2,
    buyerAgreedAt: at(55),
    sellerAgreedAt: at(60),
    createdAt: at(0),
    updatedAt: at(7 * 24 * 60),
  },
  listingText:
    "Garmin Fenix 7 Pro Sapphire Solar, 47mm. Had it about a year, worn daily. Small scuff on the bezel, glass is perfect. Comes with charger and box. PCS orders came through and I am moving next month so it needs a new home. $475.",
  sellerNotes: "Serial is on the back, photo attached. Happy to answer questions.",
  listingPhotos: [casebackPhoto, frontPhoto],
  cards: [cardV1, cardV2],
  chat: [
    { id: "m1", dealId, channel: "deal", author: "buyer", text: "Hi Luis, interested in the Fenix. Still available?", photos: [], at: at(10) },
    { id: "m2", dealId, channel: "deal", author: "seller", text: "Yes. Everything is on the card my pal built. Ask away.", photos: [], at: at(12) },
    { id: "m3", dealId, channel: "deal", author: "buyer", text: "My pal says the price is fair. It wants to see battery health before I commit. Can you add a photo of the battery page?", photos: [], at: at(35) },
    { id: "m4", dealId, channel: "deal", author: "seller", text: "Sure, one second.", photos: [], at: at(38) },
    { id: "m5", dealId, channel: "deal", author: "seller", text: "Added. About 11 days in smartwatch mode.", photos: [batteryPhoto], at: at(41) },
    { id: "m6", dealId, channel: "deal", author: "buyer", text: "Great. I am good to go.", photos: [], at: at(55) },
  ],
  marketPrice: {
    marketLow: 420,
    marketHigh: 560,
    currency: "USD",
    provider: "fixture",
    checkedAt: at(30),
    sources: [
      { name: "Online marketplace listing, used, like new", price: 445, condition: "like_new" },
      { name: "Online marketplace listing, used, good", price: 425, condition: "good" },
      { name: "Retailer, open box", price: 549, condition: "like_new" },
    ],
  },
  expectedVerdict: {
    overall: "go",
    requiredFlags: [],
    optionalFlags: [],
    forbiddenSeverity: "stop",
  },
  payment: {
    dealId,
    paypalOrderId: "FIXTURE-ORDER-CLEAN-0001",
    captureId: "FIXTURE-CAPTURE-CLEAN-0001",
    status: "CAPTURED",
    payeeEmail: "luis.o@example.com",
    amount: 475,
    currency: "USD",
    method: "paypal",
    createdAt: at(62),
    capturedAt: at(65),
  },
  shipment: {
    dealId,
    carrier: "USPS",
    trackingNumber: "9400100000000000000001",
    packingPhotos: [
      { url: "/fixtures/clean-garmin/packing-in-box.jpg", whatItShows: "Watch, cable and box inside the shipping box with padding.", addedBy: "seller", addedAt: at(24 * 60) },
      { url: "/fixtures/clean-garmin/packing-sealed.jpg", whatItShows: "Sealed box with the shipping label.", addedBy: "seller", addedAt: at(24 * 60 + 5) },
    ],
    checklist: [
      { id: "c1", label: "Photo of the watch, cable and box going into the shipping box", required: true, done: true },
      { id: "c2", label: "Photo of the sealed box with the label on it", required: true, done: true },
      { id: "c3", label: "Enter the carrier and tracking number", required: true, done: true },
      { id: "c4", label: "Ship to the address on the PayPal order only", required: true, done: true },
    ],
    shippedAt: at(24 * 60 + 30),
    deliveredAt: at(5 * 24 * 60),
  },
  arrivalPhotos: [
    { url: "/fixtures/clean-garmin/arrival-caseback.jpg", whatItShows: `Back of the watch as received. Serial ${CLEAN_SERIAL}.`, addedBy: "buyer", addedAt: at(5 * 24 * 60 + 20) },
  ],
  expectedArrival: { matches: true, mismatchFields: [] },
  timeline: [
    { id: "e1", dealId, kind: "deal_created", actor: "seller", summary: "Luis O. started a deal.", at: at(0) },
    { id: "e2", dealId, kind: "card_updated", actor: "seller_pal", summary: `Seller Pal built card version 1. Serial ${CLEAN_SERIAL} read from the caseback photo.`, at: at(1) },
    { id: "e3", dealId, kind: "state_changed", actor: "system", summary: "Listed.", fromState: "DRAFT", toState: "LISTED", at: at(1) },
    { id: "e4", dealId, kind: "review_posted", actor: "buyer_pal", summary: "Buyer Pal reviewed the deal: go, pending one photo.", at: at(30) },
    { id: "e5", dealId, kind: "state_changed", actor: "system", summary: "Reviewed.", fromState: "LISTED", toState: "REVIEWED", at: at(30) },
    { id: "e6", dealId, kind: "card_updated", actor: "seller_pal", summary: "Card version 2: battery page photo added.", at: at(42) },
    { id: "e6b", dealId, kind: "agreed", actor: "buyer", summary: "Priya S. agreed to card version 2.", at: at(55) },
    { id: "e6c", dealId, kind: "agreed", actor: "seller", summary: "Luis O. agreed to card version 2.", at: at(60) },
    { id: "e7", dealId, kind: "card_locked", actor: "system", summary: "Both sides agreed. Card version 2 is locked.", at: at(60) },
    { id: "e8", dealId, kind: "state_changed", actor: "system", summary: "Agreed.", fromState: "REVIEWED", toState: "AGREED", at: at(60) },
    { id: "e9", dealId, kind: "payment_created", actor: "paypal", summary: "PayPal checkout order created, payee luis.o@example.com.", at: at(62) },
    { id: "e10", dealId, kind: "state_changed", actor: "system", summary: "Payment pending.", fromState: "AGREED", toState: "PAYMENT_PENDING", at: at(62) },
    { id: "e11", dealId, kind: "payment_captured", actor: "paypal", summary: "Payment of $475.00 captured.", at: at(65) },
    { id: "e12", dealId, kind: "state_changed", actor: "system", summary: "Paid.", fromState: "PAYMENT_PENDING", toState: "PAID", at: at(65) },
    { id: "e13", dealId, kind: "shipped", actor: "seller", summary: "Shipped with USPS, tracking 9400100000000000000001.", at: at(24 * 60 + 30) },
    { id: "e14", dealId, kind: "state_changed", actor: "system", summary: "Shipped.", fromState: "PAID", toState: "SHIPPED", at: at(24 * 60 + 30) },
    { id: "e15", dealId, kind: "delivered", actor: "buyer", summary: "Buyer confirmed delivery.", at: at(5 * 24 * 60) },
    { id: "e16", dealId, kind: "state_changed", actor: "system", summary: "Delivered.", fromState: "SHIPPED", toState: "DELIVERED", at: at(5 * 24 * 60) },
    { id: "e17", dealId, kind: "arrival_checked", actor: "buyer_pal", summary: `Arrival matches the locked card. Serial ${CLEAN_SERIAL} confirmed.`, at: at(5 * 24 * 60 + 25) },
    { id: "e18", dealId, kind: "state_changed", actor: "system", summary: "Complete.", fromState: "DELIVERED", toState: "COMPLETE", at: at(5 * 24 * 60 + 30) },
  ],
};
