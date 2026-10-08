/**
 * Scenario 3: an empty box arrives. Seller-started (the secondary path). The
 * same clean deal up to delivery, but the
 * buyer opens the box and finds the foam insert and no console. Buyer Pal sees
 * no console serial in the arrival photos, names the mismatch, and the evidence
 * pack is built for a PayPal dispute.
 */
import { chainEvents } from "../history";
import type { ScenarioFixture } from "./types";
import type { ItemCard } from "../item-card";

const dealId = "33333333-3333-4333-8333-333333333333";
const t0 = "2026-10-22T15:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(t0) + minutes * 60_000).toISOString();

export const EMPTY_BOX_LOCKED_SERIAL = "AJ204567113";

const seller = { role: "seller", displayName: "Marcus B.", email: "marcus.b@example.com" } as const;
const buyer = { role: "buyer", displayName: "Jen K.", email: "jen.k@example.com" } as const;

const consoleSerialPhoto = {
  url: "/fixtures/empty-box/console-back-serial.jpg",
  whatItShows: `Back of a white PlayStation 5 console. The label shows serial ${EMPTY_BOX_LOCKED_SERIAL} and model CFI-1215A.`,
  addedBy: "seller",
  addedAt: at(0),
} as const;

const boxLabelPhoto = {
  url: "/fixtures/empty-box/box-label-serial.jpg",
  whatItShows: `Barcode label on a PlayStation 5 box. Serial ${EMPTY_BOX_LOCKED_SERIAL}.`,
  addedBy: "seller",
  addedAt: at(0),
} as const;

const lockedCard: ItemCard = {
  dealId,
  version: 1,
  title: "Sony PlayStation 5 disc edition with original box",
  brand: "Sony",
  model: "PlayStation 5 disc edition, CFI-1215A",
  serial: EMPTY_BOX_LOCKED_SERIAL,
  boxSerial: EMPTY_BOX_LOCKED_SERIAL,
  conditionGrade: "good",
  conditionNotes: "Used about two years. Works, no marks. Console serial matches the box label.",
  included: ["Console", "DualSense controller", "HDMI cable", "Power cable", "Original box"],
  photos: [consoleSerialPhoto, boxLabelPhoto],
  askingPrice: 410,
  currency: "USD",
  sellerPaypalEmail: "marcus.b@example.com",
  lockedAt: at(50),
};

export const emptyBox: ScenarioFixture = {
  id: "empty-box",
  name: "Empty box arrives",
  summary:
    "The deal goes through cleanly, but the box arrives with the foam insert and no console. Buyer Pal finds no console serial in the arrival photos, names the mismatch and builds the evidence pack for a PayPal dispute.",
  seller,
  buyer,
  deal: {
    id: dealId,
    state: "ISSUE",
    startedBy: "seller",
    listingUrl: null,
    sellerJoinedAt: at(0),
    scenario: "empty-box",
    seller,
    buyer,
    currentCardVersion: 1,
    lockedCardVersion: 1,
    buyerAgreedAt: at(48),
    sellerAgreedAt: at(50),
    createdAt: at(0),
    updatedAt: at(6 * 24 * 60),
  },
  listingText:
    "PlayStation 5 disc edition with original box, controller and cables. Used two years, works perfectly. $410. Local or shipped.",
  sellerNotes: "Serial photos of the console and the box attached.",
  listingPhotos: [consoleSerialPhoto, boxLabelPhoto],
  cards: [lockedCard],
  chat: [
    { id: "m1", dealId, channel: "deal", author: "buyer", text: "Hi Marcus, I will take the PS5 at $410 if the card checks out.", photos: [], at: at(10) },
    { id: "m2", dealId, channel: "deal", author: "seller", text: "Sounds good. Everything is on the card.", photos: [], at: at(12) },
    { id: "m3", dealId, channel: "deal", author: "buyer_pal", text: "Buyer Pal to seller: Can you add a photo of the Console Information screen showing the serial?", photos: [], at: at(31) },
    { id: "m4", dealId, channel: "deal", author: "buyer", text: "My pal asked for one more photo but I am fine either way. Sending payment now.", photos: [], at: at(48) },
  ],
  marketPrice: {
    marketLow: 380,
    marketHigh: 499,
    currency: "USD",
    provider: "fixture",
    checkedAt: at(30),
    sources: [
      { name: "Online marketplace listing, used, good", price: 380, condition: "good" },
      { name: "Online marketplace listing, used, like new, with box", price: 395, condition: "like_new" },
      { name: "Retailer, new", price: 499, condition: "new" },
    ],
  },
  certRecord: null,
  expectedVerdict: {
    overall: "go",
    requiredFlags: [],
    optionalFlags: [],
    forbiddenSeverity: "stop",
  },
  payment: {
    dealId,
    paypalOrderId: "FIXTURE-ORDER-EMPTY-0001",
    captureId: "FIXTURE-CAPTURE-EMPTY-0001",
    status: "CAPTURED",
    payeeEmail: "marcus.b@example.com",
    amount: 410,
    currency: "USD",
    method: "venmo",
    createdAt: at(52),
    capturedAt: at(55),
  },
  shipment: {
    dealId,
    carrier: "USPS",
    trackingNumber: "9400100000000000000002",
    packingPhotos: [
      { url: "/fixtures/empty-box/packing-sealed.jpg", whatItShows: "Sealed shipping box with the label.", addedBy: "seller", addedAt: at(24 * 60) },
    ],
    checklist: [
      { id: "c1", label: "Photo of the console, controller and cables going into the box", required: true, done: false },
      { id: "c2", label: "Photo of the sealed box with the label on it", required: true, done: true },
      { id: "c3", label: "Enter the carrier and tracking number", required: true, done: true },
      { id: "c4", label: "Ship to the address on the PayPal order only", required: true, done: true },
    ],
    shippedAt: at(24 * 60 + 15),
    deliveredAt: at(5 * 24 * 60),
    flags: [
      {
        code: "MISSING_PACKING_PHOTO",
        severity: "caution",
        evidence: "checklist: Photo of the console, controller and cables going into the box: not done",
        explanation: "The seller shipped without the photo of the item going into the box, so there is no proof of what was packed.",
        raisedByRule: true,
      },
    ],
  },
  arrivalPhotos: [
    {
      url: "/fixtures/empty-box/arrival-box-open-empty.jpg",
      whatItShows: "PlayStation 5 box opened on a table. Grey foam insert inside.",
      addedBy: "buyer",
      addedAt: at(5 * 24 * 60 + 15),
    },
    {
      url: "/fixtures/empty-box/arrival-box-label.jpg",
      whatItShows: `Barcode label on the box that arrived. Serial ${EMPTY_BOX_LOCKED_SERIAL}.`,
      addedBy: "buyer",
      addedAt: at(5 * 24 * 60 + 16),
    },
  ],
  expectedArrival: { matches: false, mismatchFields: ["serial"] },
  timeline: chainEvents([
    { id: "e1", dealId, kind: "deal_created", actor: "seller", summary: "Marcus B. started a deal.", at: at(0) },
    { id: "e2", dealId, kind: "card_updated", actor: "seller_pal", summary: `Seller Pal built card version 1. Console serial ${EMPTY_BOX_LOCKED_SERIAL} matches the box label.`, at: at(1) },
    { id: "e3", dealId, kind: "state_changed", actor: "system", summary: "Listed.", fromState: "DRAFT", toState: "LISTED", at: at(1) },
    { id: "e4", dealId, kind: "review_posted", actor: "buyer_pal", summary: "Buyer Pal reviewed the deal: go, and asked for a Console Information screen photo. The seller never answered.", at: at(30) },
    { id: "e5", dealId, kind: "state_changed", actor: "system", summary: "Reviewed.", fromState: "LISTED", toState: "REVIEWED", at: at(30) },
    { id: "e5b", dealId, kind: "agreed", actor: "buyer", summary: "Jen K. agreed to card version 1.", at: at(48) },
    { id: "e5c", dealId, kind: "agreed", actor: "seller", summary: "Marcus B. agreed to card version 1.", at: at(50) },
    { id: "e6", dealId, kind: "card_locked", actor: "system", summary: "Both sides agreed. Card version 1 is locked.", at: at(50) },
    { id: "e7", dealId, kind: "state_changed", actor: "system", summary: "Agreed.", fromState: "REVIEWED", toState: "AGREED", at: at(50) },
    { id: "e8", dealId, kind: "payment_created", actor: "paypal", summary: "PayPal checkout order created, payee marcus.b@example.com.", at: at(52) },
    { id: "e9", dealId, kind: "state_changed", actor: "system", summary: "Payment pending.", fromState: "AGREED", toState: "PAYMENT_PENDING", at: at(52) },
    { id: "e10", dealId, kind: "payment_captured", actor: "paypal", summary: "Payment of $410.00 captured via Venmo.", at: at(55) },
    { id: "e11", dealId, kind: "state_changed", actor: "system", summary: "Paid.", fromState: "PAYMENT_PENDING", toState: "PAID", at: at(55) },
    { id: "e12", dealId, kind: "shipped", actor: "seller", summary: "Shipped with USPS, tracking 9400100000000000000002. One packing photo missing.", at: at(24 * 60 + 15) },
    { id: "e13", dealId, kind: "state_changed", actor: "system", summary: "Shipped.", fromState: "PAID", toState: "SHIPPED", at: at(24 * 60 + 15) },
    { id: "e13b", dealId, kind: "shipment_checked", actor: "buyer_pal", summary: "Caution: the seller shipped without the packing photo of the item going into the box.", at: at(24 * 60 + 16) },
    { id: "e14", dealId, kind: "delivered", actor: "buyer", summary: "Buyer confirmed delivery.", at: at(5 * 24 * 60) },
    { id: "e15", dealId, kind: "state_changed", actor: "system", summary: "Delivered.", fromState: "SHIPPED", toState: "DELIVERED", at: at(5 * 24 * 60) },
    { id: "e16", dealId, kind: "arrival_checked", actor: "buyer_pal", summary: `Arrival does not match. Card says console serial ${EMPTY_BOX_LOCKED_SERIAL}. The box arrived with no console inside.`, at: at(5 * 24 * 60 + 20) },
    { id: "e17", dealId, kind: "state_changed", actor: "buyer_pal", summary: "Issue opened.", fromState: "DELIVERED", toState: "ISSUE", at: at(5 * 24 * 60 + 20) },
    { id: "e18", dealId, kind: "evidence_built", actor: "buyer_pal", summary: "Evidence pack built for a PayPal dispute.", at: at(5 * 24 * 60 + 22) },
  ]),
};
