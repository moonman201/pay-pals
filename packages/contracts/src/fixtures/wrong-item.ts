/**
 * Scenario 3: wrong item arrives. Same clean deal up to delivery, but the box
 * holds a Fenix 6 with a different serial. Buyer Pal names the mismatch and
 * the evidence pack is built for a PayPal dispute.
 */
import type { ScenarioFixture } from "./types";
import type { ItemCard } from "../item-card";

const dealId = "33333333-3333-4333-8333-333333333333";
const t0 = "2026-10-22T15:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(t0) + minutes * 60_000).toISOString();

export const WRONG_ITEM_LOCKED_SERIAL = "7LP091337";
export const WRONG_ITEM_ARRIVED_SERIAL = "6XR118204";

const seller = { role: "seller", displayName: "Marcus B.", email: "marcus.b@example.com" } as const;
const buyer = { role: "buyer", displayName: "Jen K.", email: "jen.k@example.com" } as const;

const casebackPhoto = {
  url: "/fixtures/wrong-item/caseback-serial.jpg",
  whatItShows: `Back of a Fenix 7 Pro. Serial ${WRONG_ITEM_LOCKED_SERIAL} visible.`,
  addedBy: "seller",
  addedAt: at(0),
} as const;

const frontPhoto = {
  url: "/fixtures/wrong-item/front.jpg",
  whatItShows: "Front of a Fenix 7 Pro, screen on, on a desk.",
  addedBy: "seller",
  addedAt: at(0),
} as const;

const lockedCard: ItemCard = {
  dealId,
  version: 1,
  title: "Garmin Fenix 7 Pro Solar 47mm",
  brand: "Garmin",
  model: "Fenix 7 Pro Solar 47mm",
  serial: WRONG_ITEM_LOCKED_SERIAL,
  conditionGrade: "good",
  conditionNotes: "Used about eight months. No marks on the glass, light wear on the strap.",
  included: ["Watch", "Charging cable"],
  photos: [casebackPhoto, frontPhoto],
  askingPrice: 440,
  currency: "USD",
  sellerPaypalEmail: "marcus.b@example.com",
  lockedAt: at(50),
};

export const wrongItem: ScenarioFixture = {
  id: "wrong-item",
  name: "Wrong item arrives",
  summary:
    "The deal goes through cleanly, but a Fenix 6 arrives instead of the Fenix 7 Pro on the locked card. Buyer Pal compares the serial, names the mismatch and builds the evidence pack for a PayPal dispute.",
  seller,
  buyer,
  deal: {
    id: dealId,
    state: "ISSUE",
    scenario: "wrong-item",
    seller,
    buyer,
    currentCardVersion: 1,
    lockedCardVersion: 1,
    createdAt: at(0),
    updatedAt: at(6 * 24 * 60),
  },
  listingText:
    "Garmin Fenix 7 Pro Solar 47mm, used eight months, works perfectly. Comes with charger. $440. Local or shipped.",
  sellerNotes: "Serial photo attached.",
  listingPhotos: [casebackPhoto, frontPhoto],
  cards: [lockedCard],
  chat: [
    { id: "m1", dealId, channel: "deal", author: "buyer", text: "Hi Marcus, I will take the Fenix at $440 if the card checks out.", photos: [], at: at(10) },
    { id: "m2", dealId, channel: "deal", author: "seller", text: "Sounds good. Everything is on the card.", photos: [], at: at(12) },
    { id: "m3", dealId, channel: "deal", author: "buyer", text: "My pal says go. Sending payment now.", photos: [], at: at(48) },
  ],
  marketPrice: {
    marketLow: 400,
    marketHigh: 520,
    currency: "USD",
    provider: "fixture",
    checkedAt: at(30),
    sources: [
      { name: "Online marketplace listing, used, good", price: 410, condition: "good" },
      { name: "Online marketplace listing, used, like new", price: 465, condition: "like_new" },
      { name: "Retailer, open box", price: 519, condition: "like_new" },
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
    paypalOrderId: "FIXTURE-ORDER-WRONG-0001",
    captureId: "FIXTURE-CAPTURE-WRONG-0001",
    status: "CAPTURED",
    payeeEmail: "marcus.b@example.com",
    amount: 440,
    currency: "USD",
    method: "venmo",
    createdAt: at(52),
    capturedAt: at(55),
  },
  shipment: {
    dealId,
    carrier: "UPS",
    trackingNumber: "1Z999AA10123456784",
    packingPhotos: [
      { url: "/fixtures/wrong-item/packing-sealed.jpg", whatItShows: "Sealed box with the shipping label.", addedBy: "seller", addedAt: at(24 * 60) },
    ],
    checklist: [
      { id: "c1", label: "Photo of the watch and cable going into the shipping box", required: true, done: false },
      { id: "c2", label: "Photo of the sealed box with the label on it", required: true, done: true },
      { id: "c3", label: "Enter the carrier and tracking number", required: true, done: true },
      { id: "c4", label: "Ship to the address on the PayPal order only", required: true, done: true },
    ],
    shippedAt: at(24 * 60 + 15),
    deliveredAt: at(5 * 24 * 60),
  },
  arrivalPhotos: [
    {
      url: "/fixtures/wrong-item/arrival-caseback.jpg",
      whatItShows: `Back of the watch that arrived. Reads Fenix 6, serial ${WRONG_ITEM_ARRIVED_SERIAL}.`,
      addedBy: "buyer",
      addedAt: at(5 * 24 * 60 + 15),
    },
    {
      url: "/fixtures/wrong-item/arrival-front.jpg",
      whatItShows: "Front of the watch that arrived. Older bezel style, no flashlight.",
      addedBy: "buyer",
      addedAt: at(5 * 24 * 60 + 16),
    },
  ],
  expectedArrival: { matches: false, mismatchFields: ["serial", "model"] },
  timeline: [
    { id: "e1", dealId, kind: "deal_created", actor: "seller", summary: "Marcus B. started a deal.", at: at(0) },
    { id: "e2", dealId, kind: "card_updated", actor: "seller_pal", summary: `Seller Pal built card version 1. Serial ${WRONG_ITEM_LOCKED_SERIAL} read from the caseback photo.`, at: at(1) },
    { id: "e3", dealId, kind: "state_changed", actor: "system", summary: "Listed.", fromState: "DRAFT", toState: "LISTED", at: at(1) },
    { id: "e4", dealId, kind: "review_posted", actor: "buyer_pal", summary: "Buyer Pal reviewed the deal: go.", at: at(30) },
    { id: "e5", dealId, kind: "state_changed", actor: "system", summary: "Reviewed.", fromState: "LISTED", toState: "REVIEWED", at: at(30) },
    { id: "e6", dealId, kind: "card_locked", actor: "system", summary: "Both sides agreed. Card version 1 is locked.", at: at(50) },
    { id: "e7", dealId, kind: "state_changed", actor: "system", summary: "Agreed.", fromState: "REVIEWED", toState: "AGREED", at: at(50) },
    { id: "e8", dealId, kind: "payment_created", actor: "paypal", summary: "PayPal checkout order created, payee marcus.b@example.com.", at: at(52) },
    { id: "e9", dealId, kind: "state_changed", actor: "system", summary: "Payment pending.", fromState: "AGREED", toState: "PAYMENT_PENDING", at: at(52) },
    { id: "e10", dealId, kind: "payment_captured", actor: "paypal", summary: "Payment of $440.00 captured via Venmo.", at: at(55) },
    { id: "e11", dealId, kind: "state_changed", actor: "system", summary: "Paid.", fromState: "PAYMENT_PENDING", toState: "PAID", at: at(55) },
    { id: "e12", dealId, kind: "shipped", actor: "seller", summary: "Shipped with UPS, tracking 1Z999AA10123456784. One packing photo missing.", at: at(24 * 60 + 15) },
    { id: "e13", dealId, kind: "state_changed", actor: "system", summary: "Shipped.", fromState: "PAID", toState: "SHIPPED", at: at(24 * 60 + 15) },
    { id: "e14", dealId, kind: "delivered", actor: "buyer", summary: "Buyer confirmed delivery.", at: at(5 * 24 * 60) },
    { id: "e15", dealId, kind: "state_changed", actor: "system", summary: "Delivered.", fromState: "SHIPPED", toState: "DELIVERED", at: at(5 * 24 * 60) },
    { id: "e16", dealId, kind: "arrival_checked", actor: "buyer_pal", summary: `Arrival does not match. Card says Fenix 7 Pro, serial ${WRONG_ITEM_LOCKED_SERIAL}. Arrived: Fenix 6, serial ${WRONG_ITEM_ARRIVED_SERIAL}.`, at: at(5 * 24 * 60 + 20) },
    { id: "e17", dealId, kind: "state_changed", actor: "buyer_pal", summary: "Issue opened.", fromState: "DELIVERED", toState: "ISSUE", at: at(5 * 24 * 60 + 20) },
    { id: "e18", dealId, kind: "evidence_built", actor: "buyer_pal", summary: "Evidence pack built for a PayPal dispute.", at: at(5 * 24 * 60 + 22) },
  ],
};
