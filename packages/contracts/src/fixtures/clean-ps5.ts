/**
 * Scenario 2: clean deal. Buyer-started. Priya taps "Use Pay Pals Protection"
 * on a PlayStation 5 listing and invites the seller by PayPal email. He joins
 * and uploads his photos: the back of the console, the box label and
 * everything that is included.
 *
 * The wide shot of the back does not show the serial large enough to trust, so
 * the Buyer Pal asks for a close-up of the serial label on the console itself,
 * because a box label is not the item. The seller adds it as card version 2,
 * the console serial and the box label agree, and the deal goes through.
 *
 * Every value here comes from the real photos in assets/demo-photos.
 */
import { chainEvents } from "../history";
import type { ScenarioFixture } from "./types";
import type { ItemCard } from "../item-card";

const dealId = "22222222-2222-4222-8222-222222222222";
const t0 = "2026-10-21T16:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(t0) + minutes * 60_000).toISOString();

/** Read off the console and off the box label in the photos. */
export const CLEAN_SERIAL = "AJ164952580";
export const CLEAN_MODEL = "CFI-1015A";

const seller = { role: "seller", displayName: "Matt M.", email: "matt.m@example.com" } as const;
const buyer = { role: "buyer", displayName: "Priya S.", email: "priya.s@example.com" } as const;

const consoleBackPhoto = {
  url: "/fixtures/clean-ps5/console-back.jpg",
  whatItShows: `Back of a white PlayStation 5. The printed block reads Sony PlayStation 5, MODEL ${CLEAN_MODEL}, manufactured February 2021. A barcode sticker sits to the right of it, too small in this shot to read.`,
  addedBy: "seller",
  addedAt: at(3),
} as const;

const boxLabelPhoto = {
  url: "/fixtures/clean-ps5/box-label.jpg",
  whatItShows: `Registration label on a PlayStation 5 box, torn open along the top. It reads "Serial # for Registration" with a barcode and ${CLEAN_SERIAL} beside it.`,
  addedBy: "seller",
  addedAt: at(3),
} as const;

const includedPhoto = {
  url: "/fixtures/clean-ps5/everything-included.jpg",
  whatItShows: "A white PlayStation 5 laid out with a blue DualSense controller, an HDMI cable, a power cable, a USB cable and the round stand.",
  addedBy: "seller",
  addedAt: at(3),
} as const;

const serialCloseUpPhoto = {
  url: "/fixtures/clean-ps5/console-serial-closeup.jpg",
  whatItShows: `Close-up of the label on the back of the console. The barcode is readable and the number under it is ${CLEAN_SERIAL}.`,
  addedBy: "seller",
  addedAt: at(40),
} as const;

const cardV1: ItemCard = {
  dealId,
  version: 1,
  title: `Sony PlayStation 5 disc edition, ${CLEAN_MODEL}, with the original box`,
  brand: "Sony",
  model: `PlayStation 5 disc edition, ${CLEAN_MODEL}`,
  serial: null,
  boxSerial: CLEAN_SERIAL,
  conditionGrade: "good",
  conditionNotes:
    "Bought new in 2021 and used in a smoke-free home. Everything in the photo is included: the console, a blue DualSense controller, HDMI, power and USB cables and the stand. The serial on the box label is readable. The sticker on the console is in the photo but too small to read.",
  included: ["Console", "Blue DualSense controller", "HDMI cable", "Power cable", "USB cable", "Stand", "Original box"],
  photos: [consoleBackPhoto, boxLabelPhoto, includedPhoto],
  askingPrice: 420,
  currency: "USD",
  sellerPaypalEmail: "matt.m@example.com",
  lockedAt: null,
};

const cardV2: ItemCard = {
  ...cardV1,
  version: 2,
  serial: CLEAN_SERIAL,
  conditionNotes:
    cardV1.conditionNotes + " Close-up added: the serial on the console matches the serial on the box label.",
  photos: [consoleBackPhoto, boxLabelPhoto, includedPhoto, serialCloseUpPhoto],
  lockedAt: at(60),
};

export const cleanPs5: ScenarioFixture = {
  id: "clean-ps5",
  name: "Clean deal",
  summary:
    "A buyer invites a seller for a PlayStation 5 with its original box. The Buyer Pal cannot read the serial on the console from the wide shot, so it asks for a close-up. The seller sends one, the console serial matches the box label, and the deal goes through to a paid, shipped, matched ending.",
  seller,
  buyer,
  deal: {
    id: dealId,
    state: "COMPLETE",
    startedBy: "buyer",
    listingUrl: "https://marketplace.example/listings/5120",
    sellerJoinedAt: at(3),
    scenario: "clean-ps5",
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
    "PlayStation 5, disc version, with the original box. Bought it new in 2021, smoke free house, works perfectly. Comes with the blue controller, HDMI, power and USB cables and the stand. $420.",
  sellerNotes: "Box label photo has the serial on it. Happy to answer anything.",
  listingPhotos: [consoleBackPhoto, boxLabelPhoto, includedPhoto],
  cards: [cardV1, cardV2],
  chat: [
    { id: "m1", dealId, channel: "deal", author: "buyer", text: "Hi, I sent you a Pay Pals invite for the PS5. Still available?", photos: [], at: at(10) },
    { id: "m2", dealId, channel: "deal", author: "seller", text: "Yes it is. Card is filled in, ask me anything.", photos: [], at: at(12) },
    { id: "m3", dealId, channel: "deal", author: "buyer_pal", text: "Can you send a close-up of the serial label on the console itself? The box label is readable but a box is not the console.", photos: [], at: at(31) },
    { id: "m4", dealId, channel: "deal", author: "seller", text: "Sure, give me a second.", photos: [], at: at(38) },
    { id: "m5", dealId, channel: "deal", author: "seller", text: "Here you go, that is the sticker on the back.", photos: [serialCloseUpPhoto], at: at(41) },
    { id: "m6", dealId, channel: "deal", author: "buyer", text: "Perfect, matches the box. I am good to go.", photos: [], at: at(55) },
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
    payeeEmail: "matt.m@example.com",
    amount: 420,
    currency: "USD",
    method: "paypal",
    createdAt: at(62),
    capturedAt: at(65),
  },
  shipment: {
    dealId,
    carrier: "UPS",
    trackingNumber: "1Z999AA10123456784",
    packingPhotos: [
      { url: "/fixtures/clean-ps5/packing-in-box.jpg", whatItShows: "The controller, cables and stand laid in the open shipping box on top of the console box.", addedBy: "seller", addedAt: at(24 * 60) },
      { url: "/fixtures/clean-ps5/packing-sealed.jpg", whatItShows: "The same box taped shut along the seam, no label on it yet.", addedBy: "seller", addedAt: at(24 * 60 + 5) },
    ],
    checklist: [
      { id: "c1", label: "Photo of the console, controller and cables going into the box", required: true, done: true },
      { id: "c2", label: "Photo of the sealed box", required: true, done: true },
      { id: "c3", label: "Enter the carrier and tracking number", required: true, done: true },
      { id: "c4", label: "Ship to the address on the PayPal order only", required: true, done: true },
    ],
    shippedAt: at(24 * 60 + 30),
    deliveredAt: at(5 * 24 * 60),
  },
  arrivalPhotos: [
    { url: "/fixtures/clean-ps5/arrival-console-serial.jpg", whatItShows: `Close-up of the label on the back of the console that arrived. The number under the barcode is ${CLEAN_SERIAL}.`, addedBy: "buyer", addedAt: at(5 * 24 * 60 + 20) },
  ],
  expectedArrival: { outcome: "match", mismatchFields: [] },
  timeline: chainEvents([
    { id: "e1", dealId, kind: "deal_created", actor: "buyer", summary: "Priya S. started a deal from a listing and invited the seller.", at: at(0) },
    { id: "e1b", dealId, kind: "seller_invited", actor: "system", summary: "Invite link created for the seller. The buyer sends it.", at: at(0) },
    { id: "e1c", dealId, kind: "state_changed", actor: "system", summary: "Waiting for the seller.", fromState: "DRAFT", toState: "INVITED", at: at(0) },
    { id: "e1d", dealId, kind: "seller_joined", actor: "seller", summary: "Matt M. joined the deal.", at: at(3) },
    { id: "e2", dealId, kind: "card_updated", actor: "seller_pal", summary: `Seller Pal built card version 1. The box label reads ${CLEAN_SERIAL}. The sticker on the console is in the wide shot but not readable.`, at: at(4) },
    { id: "e3", dealId, kind: "state_changed", actor: "system", summary: "Listed.", fromState: "INVITED", toState: "LISTED", at: at(4) },
    { id: "e4", dealId, kind: "review_posted", actor: "buyer_pal", summary: "Buyer Pal reviewed card version 1: go, and asked for a close-up of the serial on the console.", at: at(30) },
    { id: "e5", dealId, kind: "state_changed", actor: "system", summary: "Reviewed.", fromState: "LISTED", toState: "REVIEWED", at: at(30) },
    { id: "e6", dealId, kind: "card_updated", actor: "seller_pal", summary: `Card version 2: close-up added. Console ${CLEAN_SERIAL} matches the box label.`, at: at(42) },
    { id: "e6a", dealId, kind: "state_changed", actor: "system", summary: "Card changed. It needs a fresh review.", fromState: "REVIEWED", toState: "LISTED", at: at(42) },
    { id: "e6a2", dealId, kind: "review_posted", actor: "buyer_pal", summary: "Buyer Pal reviewed card version 2: go.", at: at(46) },
    { id: "e6a3", dealId, kind: "state_changed", actor: "system", summary: "Reviewed.", fromState: "LISTED", toState: "REVIEWED", at: at(46) },
    { id: "e6b", dealId, kind: "agreed", actor: "buyer", summary: "Priya S. agreed to card version 2.", at: at(55) },
    { id: "e6c", dealId, kind: "agreed", actor: "seller", summary: "Matt M. agreed to card version 2.", at: at(60) },
    { id: "e7", dealId, kind: "card_locked", actor: "system", summary: "Both sides agreed. Card version 2 is locked.", at: at(60) },
    { id: "e8", dealId, kind: "state_changed", actor: "system", summary: "Agreed.", fromState: "REVIEWED", toState: "AGREED", at: at(60) },
    { id: "e9", dealId, kind: "payment_created", actor: "paypal", summary: "PayPal checkout order created, payee matt.m@example.com.", at: at(62) },
    { id: "e10", dealId, kind: "state_changed", actor: "system", summary: "Payment pending.", fromState: "AGREED", toState: "PAYMENT_PENDING", at: at(62) },
    { id: "e11", dealId, kind: "payment_captured", actor: "paypal", summary: "Payment of $420.00 captured.", at: at(65) },
    { id: "e12", dealId, kind: "state_changed", actor: "system", summary: "Paid.", fromState: "PAYMENT_PENDING", toState: "PAID", at: at(65) },
    { id: "e13", dealId, kind: "shipped", actor: "seller", summary: "Shipped with UPS, tracking 1Z999AA10123456784.", at: at(24 * 60 + 30) },
    { id: "e14", dealId, kind: "state_changed", actor: "system", summary: "Shipped.", fromState: "PAID", toState: "SHIPPED", at: at(24 * 60 + 30) },
    { id: "e15", dealId, kind: "delivered", actor: "buyer", summary: "Buyer confirmed delivery.", at: at(5 * 24 * 60) },
    { id: "e16", dealId, kind: "state_changed", actor: "system", summary: "Delivered.", fromState: "SHIPPED", toState: "DELIVERED", at: at(5 * 24 * 60) },
    { id: "e17", dealId, kind: "arrival_checked", actor: "buyer_pal", summary: `Arrival matches the locked card. Serial ${CLEAN_SERIAL} read on the console that arrived.`, at: at(5 * 24 * 60 + 25) },
    { id: "e18", dealId, kind: "state_changed", actor: "system", summary: "Complete.", fromState: "DELIVERED", toState: "COMPLETE", at: at(5 * 24 * 60 + 30) },
  ]),
};
