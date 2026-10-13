/**
 * Scenario 3: an empty box arrives. Seller-started, the secondary path.
 *
 * The Buyer Pal asks for the same close-up of the serial on the console that
 * the clean deal gets. This seller never answers it. The buyer pays anyway,
 * which is allowed: a question with no answer is a caution, not a block. The
 * seller then ships without the photo of the item going into the box, which
 * the Buyer Pal raises at ship time. What arrives is the box, the foam and a
 * plastic bag, and no console. The evidence pack names all three.
 *
 * The console photos are the same physical console as the clean deal, which is
 * why the serial matches it. The reused-photo check compares against the
 * reference folder only, so sharing a photo between two demo deals is not a
 * flag.
 */
import { chainEvents } from "../history";
import type { ScenarioFixture } from "./types";
import type { ItemCard } from "../item-card";

const dealId = "33333333-3333-4333-8333-333333333333";
const t0 = "2026-10-22T15:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(t0) + minutes * 60_000).toISOString();

export const EMPTY_BOX_LOCKED_SERIAL = "AJ164952580";
const MODEL = "CFI-1015A";

const seller = { role: "seller", displayName: "Marcus B.", email: "marcus.b@example.com" } as const;
const buyer = { role: "buyer", displayName: "Jen K.", email: "jen.k@example.com" } as const;

const consoleBackPhoto = {
  url: "/fixtures/empty-box/console-back.jpg",
  whatItShows: `Back of a white PlayStation 5. The printed block reads Sony PlayStation 5, MODEL ${MODEL}, manufactured February 2021. A barcode sticker sits to the right of it, too small in this shot to read.`,
  addedBy: "seller",
  addedAt: at(0),
} as const;

const boxLabelPhoto = {
  url: "/fixtures/empty-box/box-label.jpg",
  whatItShows: `Registration label on a PlayStation 5 box. It reads "Serial # for Registration" with a barcode and ${EMPTY_BOX_LOCKED_SERIAL} beside it.`,
  addedBy: "seller",
  addedAt: at(0),
} as const;

const lockedCard: ItemCard = {
  dealId,
  version: 1,
  title: `Sony PlayStation 5 disc edition, ${MODEL}, with the original box`,
  brand: "Sony",
  model: `PlayStation 5 disc edition, ${MODEL}`,
  serial: null,
  boxSerial: EMPTY_BOX_LOCKED_SERIAL,
  conditionGrade: "good",
  conditionNotes:
    "Used for about two years, works fine. The serial on the box label is readable. The sticker on the console is in the photo but too small to read.",
  included: ["Console", "Controller", "HDMI cable", "Power cable", "Original box"],
  photos: [consoleBackPhoto, boxLabelPhoto],
  askingPrice: 410,
  currency: "USD",
  sellerPaypalEmail: "marcus.b@example.com",
  lockedAt: at(50),
};

export const emptyBox: ScenarioFixture = {
  id: "empty-box",
  name: "Empty box arrives",
  summary:
    "The Buyer Pal asks for a close-up of the serial on the console and never gets one. The buyer pays anyway. The seller ships without the packing photo, and the box arrives with the foam and a plastic bag inside and no console. The evidence pack names the unanswered question, the missing packing photo and the console that is not there.",
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
    "PS5 disc edition with the original box, controller and cables. Used about two years, works perfectly. $410. Can ship.",
  sellerNotes: "Serial is on the box label, photo attached.",
  listingPhotos: [consoleBackPhoto, boxLabelPhoto],
  cards: [lockedCard],
  chat: [
    { id: "m1", dealId, channel: "deal", author: "buyer", text: "Hi Marcus, I will take the PS5 at $410 if the card checks out.", photos: [], at: at(10) },
    { id: "m2", dealId, channel: "deal", author: "seller", text: "Sounds good. Everything is on the card.", photos: [], at: at(12) },
    { id: "m3", dealId, channel: "deal", author: "buyer_pal", text: "Can you send a close-up of the serial label on the console itself? The box label is readable but a box is not the console.", photos: [], at: at(31) },
    { id: "m4", dealId, channel: "deal", author: "buyer", text: "My pal asked for one more photo but I am happy either way. Sending payment now.", photos: [], at: at(48) },
  ],
  marketPrice: {
    marketLow: 380,
    marketHigh: 499,
    currency: "USD",
    provider: "fixture",
    checkedAt: at(30),
    sources: [
      { name: "Used listing", price: 380, condition: "good" },
      { name: "Used listing", price: 425, condition: "like_new" },
      { name: "Retail listing, new", price: 499, condition: "new" },
    ],
  },
  certRecord: null,
  expectedVerdict: {
    overall: "caution",
    requiredFlags: ["MISSING_SERIAL"],
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
      { url: "/fixtures/empty-box/packing-sealed.jpg", whatItShows: "A shipping box taped shut along the seam, no label on it yet.", addedBy: "seller", addedAt: at(24 * 60) },
    ],
    checklist: [
      { id: "c1", label: "Photo of the console, controller and cables going into the box", required: true, done: false },
      { id: "c2", label: "Photo of the sealed box", required: true, done: true },
      { id: "c3", label: "Enter the carrier and tracking number", required: true, done: true },
      { id: "c4", label: "Ship to the address on the PayPal order only", required: true, done: true },
    ],
    shippedAt: at(24 * 60 + 15),
    deliveredAt: at(5 * 24 * 60),
    flags: [
      {
        code: "MISSING_PACKING_PHOTO",
        severity: "caution",
        evidence: "Packing step not done: Photo of the console, controller and cables going into the box",
        explanation: "Shipped with no photo of the item going into the box.",
        raisedByRule: true,
      },
    ],
  },
  arrivalPhotos: [
    {
      url: "/fixtures/empty-box/arrival-box-open-empty.jpg",
      whatItShows: "The open box on the carpet. Two white foam inserts and a crumpled clear plastic bag. Nothing between them.",
      addedBy: "buyer",
      addedAt: at(5 * 24 * 60 + 15),
    },
    {
      url: "/fixtures/empty-box/arrival-box-label.jpg",
      whatItShows: `Registration label on the box that arrived, reading ${EMPTY_BOX_LOCKED_SERIAL}.`,
      addedBy: "buyer",
      addedAt: at(5 * 24 * 60 + 16),
    },
  ],
  // The locked card never got a serial off the console, so the mismatch is not a
  // serial that differs: it is that no console arrived at all.
  expectedArrival: { outcome: "mismatch", mismatchFields: ["other"] },
  timeline: chainEvents([
    { id: "e1", dealId, kind: "deal_created", actor: "seller", summary: "Marcus B. started a deal.", at: at(0) },
    { id: "e2", dealId, kind: "card_updated", actor: "seller_pal", summary: `Seller Pal built card version 1. The box label reads ${EMPTY_BOX_LOCKED_SERIAL}. The sticker on the console is in the wide shot but not readable.`, at: at(1) },
    { id: "e3", dealId, kind: "state_changed", actor: "system", summary: "Listed.", fromState: "DRAFT", toState: "LISTED", at: at(1) },
    { id: "e4", dealId, kind: "review_posted", actor: "buyer_pal", summary: "Buyer Pal reviewed the deal: caution, the serial was read only off the box label, and asked for a close-up of the serial on the console. The seller never answered.", at: at(30) },
    { id: "e5", dealId, kind: "state_changed", actor: "system", summary: "Reviewed.", fromState: "LISTED", toState: "REVIEWED", at: at(30) },
    { id: "e5b", dealId, kind: "agreed", actor: "buyer", summary: "Jen K. agreed to card version 1.", at: at(48) },
    { id: "e5c", dealId, kind: "agreed", actor: "seller", summary: "Marcus B. agreed to card version 1.", at: at(50) },
    { id: "e6", dealId, kind: "card_locked", actor: "system", summary: "Both sides agreed. Card version 1 is locked.", at: at(50) },
    { id: "e7", dealId, kind: "state_changed", actor: "system", summary: "Agreed.", fromState: "REVIEWED", toState: "AGREED", at: at(50) },
    { id: "e8", dealId, kind: "payment_created", actor: "paypal", summary: "PayPal checkout order created, payee marcus.b@example.com.", at: at(52) },
    { id: "e9", dealId, kind: "state_changed", actor: "system", summary: "Payment pending.", fromState: "AGREED", toState: "PAYMENT_PENDING", at: at(52) },
    { id: "e10", dealId, kind: "payment_captured", actor: "paypal", summary: "Payment of $410.00 captured via Venmo.", at: at(55) },
    { id: "e11", dealId, kind: "state_changed", actor: "system", summary: "Paid.", fromState: "PAYMENT_PENDING", toState: "PAID", at: at(55) },
    { id: "e12", dealId, kind: "shipped", actor: "seller", summary: "Shipped with USPS, tracking 9400100000000000000002.", at: at(24 * 60 + 15) },
    { id: "e13", dealId, kind: "state_changed", actor: "system", summary: "Shipped.", fromState: "PAID", toState: "SHIPPED", at: at(24 * 60 + 15) },
    { id: "e13b", dealId, kind: "shipment_checked", actor: "buyer_pal", summary: "Caution: the seller shipped without the packing photo of the item going into the box.", at: at(24 * 60 + 16) },
    { id: "e14", dealId, kind: "delivered", actor: "buyer", summary: "Buyer confirmed delivery.", at: at(5 * 24 * 60) },
    { id: "e15", dealId, kind: "state_changed", actor: "system", summary: "Delivered.", fromState: "SHIPPED", toState: "DELIVERED", at: at(5 * 24 * 60) },
    { id: "e16", dealId, kind: "arrival_checked", actor: "buyer_pal", summary: `Arrival does not match. The locked card describes a PlayStation 5 with ${EMPTY_BOX_LOCKED_SERIAL} on its box label and no serial ever read off the console. The box arrived with the foam and a plastic bag and no console.`, at: at(5 * 24 * 60 + 20) },
    { id: "e17", dealId, kind: "state_changed", actor: "buyer", summary: "Issue opened: what arrived does not match the locked card. The box arrived empty.", fromState: "DELIVERED", toState: "ISSUE", at: at(5 * 24 * 60 + 20) },
    { id: "e18", dealId, kind: "evidence_built", actor: "buyer_pal", summary: "Evidence pack built for a PayPal dispute.", at: at(5 * 24 * 60 + 22) },
  ]),
};
