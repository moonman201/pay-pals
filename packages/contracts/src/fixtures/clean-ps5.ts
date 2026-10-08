/**
 * Scenario 2: clean deal. Buyer-started. Priya taps "Use Pay Pals Protection"
 * on Matt's listing and invites him by PayPal email. Matt joins and uploads
 * photos of his PlayStation 5 with its original box.
 * Seller Pal reads the serial on the back of the console and the serial on the
 * box label and confirms they match. Buyer Pal confirms the price and asks for
 * a photo of the Console Information screen. Seller adds it (card version 2).
 * Both agree, buyer pays, seller ships, buyer confirms. Complete.
 *
 * Serial values are placeholders until the real photos land in
 * assets/demo-photos; see BLOCKERS.md.
 */
import { chainEvents } from "../history";
import type { ScenarioFixture } from "./types";
import type { ItemCard } from "../item-card";

const dealId = "22222222-2222-4222-8222-222222222222";
const t0 = "2026-10-21T16:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(t0) + minutes * 60_000).toISOString();

export const CLEAN_SERIAL = "AH912345678";

const seller = { role: "seller", displayName: "Matt M.", email: "matt.m@example.com" } as const;
const buyer = { role: "buyer", displayName: "Priya S.", email: "priya.s@example.com" } as const;

const consoleSerialPhoto = {
  url: "/fixtures/clean-ps5/console-back-serial.jpg",
  whatItShows: `Back of a white PlayStation 5 console. The label shows serial ${CLEAN_SERIAL} and model CFI-1215A.`,
  addedBy: "seller",
  addedAt: at(3),
} as const;

const boxLabelPhoto = {
  url: "/fixtures/clean-ps5/box-label-serial.jpg",
  whatItShows: `Barcode label on a PlayStation 5 box. Serial ${CLEAN_SERIAL}, model CFI-1215A.`,
  addedBy: "seller",
  addedAt: at(3),
} as const;

const frontPhoto = {
  url: "/fixtures/clean-ps5/front-with-box.jpg",
  whatItShows: "White PlayStation 5 standing next to its open box, with a controller and two cables.",
  addedBy: "seller",
  addedAt: at(3),
} as const;

const consoleInfoPhoto = {
  url: "/fixtures/clean-ps5/console-information-screen.jpg",
  whatItShows: `TV screen showing the PlayStation Console Information page. Serial ${CLEAN_SERIAL}, system software version listed.`,
  addedBy: "seller",
  addedAt: at(40),
} as const;

const cardV1: ItemCard = {
  dealId,
  version: 1,
  title: "Sony PlayStation 5 disc edition with original box",
  brand: "Sony",
  model: "PlayStation 5 disc edition, CFI-1215A",
  serial: CLEAN_SERIAL,
  boxSerial: CLEAN_SERIAL,
  conditionGrade: "good",
  conditionNotes: "Owned from new, used in a smoke-free home. Light scuff on the base, no marks on the console. Console serial matches the box label.",
  included: ["Console", "DualSense controller", "HDMI cable", "Power cable", "Original box"],
  photos: [consoleSerialPhoto, boxLabelPhoto, frontPhoto],
  askingPrice: 420,
  currency: "USD",
  sellerPaypalEmail: "matt.m@example.com",
  lockedAt: null,
};

const cardV2: ItemCard = {
  ...cardV1,
  version: 2,
  conditionNotes: cardV1.conditionNotes + " Console Information screen shows the same serial and up-to-date system software.",
  photos: [consoleSerialPhoto, boxLabelPhoto, frontPhoto, consoleInfoPhoto],
  lockedAt: at(60),
};

export const cleanPs5: ScenarioFixture = {
  id: "clean-ps5",
  name: "Clean deal",
  summary:
    "A PlayStation 5 with its original box. Seller Pal reads the console serial and the box label and confirms they match, Buyer Pal confirms the price and asks for the Console Information screen, both agree, the buyer pays with PayPal and the console arrives as described.",
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
    "PlayStation 5 disc edition, CFI-1215A, with the original box, DualSense controller, HDMI and power cables. Owned from new, works perfectly, light scuff on the base. $420.",
  sellerNotes: "Serial is on the back of the console and on the box label, photos of both attached.",
  listingPhotos: [consoleSerialPhoto, boxLabelPhoto, frontPhoto],
  cards: [cardV1, cardV2],
  chat: [
    { id: "m1", dealId, channel: "deal", author: "buyer", text: "Hi Matt, I sent you a Pay Pals invite for the PS5. Still available?", photos: [], at: at(10) },
    { id: "m2", dealId, channel: "deal", author: "seller", text: "Yes. Everything is on the card my pal built. Ask away.", photos: [], at: at(12) },
    { id: "m3", dealId, channel: "deal", author: "buyer", text: "My pal says the price is fair and the serials match. It wants a photo of the Console Information screen before I commit. Can you add one?", photos: [], at: at(35) },
    { id: "m4", dealId, channel: "deal", author: "seller", text: "Sure, one second.", photos: [], at: at(38) },
    { id: "m5", dealId, channel: "deal", author: "seller", text: "Added. Same serial on the screen, software is current.", photos: [consoleInfoPhoto], at: at(41) },
    { id: "m6", dealId, channel: "deal", author: "buyer", text: "Great. I am good to go.", photos: [], at: at(55) },
  ],
  marketPrice: {
    marketLow: 380,
    marketHigh: 499,
    currency: "USD",
    provider: "fixture",
    checkedAt: at(30),
    sources: [
      { name: "Online marketplace listing, used, like new, with box", price: 395, condition: "like_new" },
      { name: "Online marketplace listing, used, good", price: 380, condition: "good" },
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
      { url: "/fixtures/clean-ps5/packing-in-box.jpg", whatItShows: "PlayStation 5 box with the console, a controller and cables inside, sitting in a larger shipping box with padding.", addedBy: "seller", addedAt: at(24 * 60) },
      { url: "/fixtures/clean-ps5/packing-sealed.jpg", whatItShows: "Sealed shipping box with the label.", addedBy: "seller", addedAt: at(24 * 60 + 5) },
    ],
    checklist: [
      { id: "c1", label: "Photo of the console, controller and cables going into the box", required: true, done: true },
      { id: "c2", label: "Photo of the sealed box with the label on it", required: true, done: true },
      { id: "c3", label: "Enter the carrier and tracking number", required: true, done: true },
      { id: "c4", label: "Ship to the address on the PayPal order only", required: true, done: true },
    ],
    shippedAt: at(24 * 60 + 30),
    deliveredAt: at(5 * 24 * 60),
  },
  arrivalPhotos: [
    { url: "/fixtures/clean-ps5/arrival-console-serial.jpg", whatItShows: `Back of a white PlayStation 5 console on a desk. The label shows serial ${CLEAN_SERIAL}.`, addedBy: "buyer", addedAt: at(5 * 24 * 60 + 20) },
  ],
  expectedArrival: { matches: true, mismatchFields: [] },
  timeline: chainEvents([
    { id: "e1", dealId, kind: "deal_created", actor: "buyer", summary: "Priya S. started a deal from a listing and invited the seller.", at: at(0) },
    { id: "e1b", dealId, kind: "seller_invited", actor: "system", summary: "Invite link created for the seller. The buyer sends it.", at: at(0) },
    { id: "e1c", dealId, kind: "state_changed", actor: "system", summary: "Waiting for the seller.", fromState: "DRAFT", toState: "INVITED", at: at(0) },
    { id: "e1d", dealId, kind: "seller_joined", actor: "seller", summary: "Matt M. joined the deal.", at: at(3) },
    { id: "e2", dealId, kind: "card_updated", actor: "seller_pal", summary: `Seller Pal built card version 1. Console serial ${CLEAN_SERIAL} read from the back of the console; the box label shows the same serial.`, at: at(4) },
    { id: "e3", dealId, kind: "state_changed", actor: "system", summary: "Listed.", fromState: "INVITED", toState: "LISTED", at: at(4) },
    { id: "e4", dealId, kind: "review_posted", actor: "buyer_pal", summary: "Buyer Pal reviewed the deal: go, pending one photo.", at: at(30) },
    { id: "e5", dealId, kind: "state_changed", actor: "system", summary: "Reviewed.", fromState: "LISTED", toState: "REVIEWED", at: at(30) },
    { id: "e6", dealId, kind: "card_updated", actor: "seller_pal", summary: "Card version 2: Console Information screen photo added.", at: at(42) },
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
    { id: "e17", dealId, kind: "arrival_checked", actor: "buyer_pal", summary: `Arrival matches the locked card. Serial ${CLEAN_SERIAL} confirmed.`, at: at(5 * 24 * 60 + 25) },
    { id: "e18", dealId, kind: "state_changed", actor: "system", summary: "Complete.", fromState: "DELIVERED", toState: "COMPLETE", at: at(5 * 24 * 60 + 30) },
  ]),
};
