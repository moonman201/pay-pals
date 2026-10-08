/**
 * Scenario 1: fake slab stopped. Buyer-started. The buyer taps "Use Pay Pals
 * Protection" on a listing for a PSA 10 Charizard priced far under market and
 * invites the seller by PayPal email. The seller joins and uploads the slab
 * photo (reused from Matt's real listing). The Buyer Pal checks the cert
 * number with PSA: the record is a different card and grade. Together with the
 * Friends and Family ask and the pressure, the deal stops. No order is created.
 */
import { chainEvents } from "../history";
import type { ScenarioFixture } from "./types";

const dealId = "11111111-1111-4111-8111-111111111111";
const t0 = "2026-10-20T14:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(t0) + minutes * 60_000).toISOString();

export const FAKE_SLAB_CERT = "81234567";

const seller = { role: "seller", displayName: "Tyler R.", email: "quickcash.deals.2026@example.com" } as const;
const buyer = { role: "buyer", displayName: "Dana M.", email: "dana.m@example.com" } as const;
const listingUrl = "https://marketplace.example/listings/8841";

const slabFront = {
  url: "/fixtures/fake-slab/slab-front.jpg",
  whatItShows: `Front of a PSA slab on a wooden table. Label reads 1999 POKEMON GAME CHARIZARD-HOLO #4, GEM MT 10, cert ${FAKE_SLAB_CERT}.`,
  addedBy: "seller",
  addedAt: at(4),
} as const;

export const fakeSlab: ScenarioFixture = {
  id: "fake-slab",
  name: "Fake slab stopped",
  summary:
    "A buyer taps Use Pay Pals Protection on a PSA 10 Charizard listed at $750 and invites the seller. The seller reuses someone else's photo, says he is moving out of state tomorrow and that the first to send Friends and Family gets it. The Buyer Pal checks the cert number with PSA: it is a different card. Stopped before any money moves.",
  seller,
  buyer,
  deal: {
    id: dealId,
    state: "BLOCKED",
    startedBy: "buyer",
    listingUrl,
    sellerJoinedAt: at(4),
    scenario: "fake-slab",
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
    "1999 Pokemon Base Set Charizard Holo PSA 10. Gem mint, slab is flawless. $750 FIRM. Moving out of state tomorrow so it needs to go today. Serious buyers only. No lowballs.",
  sellerNotes: "Just pay and I ship. Cert number is on the label.",
  listingPhotos: [slabFront],
  cards: [
    {
      dealId,
      version: 1,
      title: "1999 Pokemon Base Set Charizard Holo, PSA 10",
      brand: "Pokemon",
      model: "Base Set Charizard Holo #4",
      serial: null,
      certNumber: FAKE_SLAB_CERT,
      grade: "PSA 10",
      conditionGrade: "like_new",
      conditionNotes: "Graded PSA 10 per the label. One photo of the slab front.",
      included: ["Graded slab"],
      photos: [slabFront],
      askingPrice: 750,
      currency: "USD",
      sellerPaypalEmail: "quickcash.deals.2026@example.com",
      lockedAt: null,
    },
  ],
  chat: [
    { id: "m1", dealId, channel: "deal", author: "buyer", text: "Hi, I sent you a Pay Pals invite for the Charizard. Still available?", photos: [], at: at(2) },
    { id: "m2", dealId, channel: "deal", author: "seller", text: "Yes but it has to be today. I am moving out of state tomorrow and clearing everything out.", photos: [], at: at(5) },
    { id: "m3", dealId, channel: "deal", author: "buyer", text: "Can you add a clear photo of the back of the slab and the cert number?", photos: [], at: at(6) },
    { id: "m4", dealId, channel: "deal", author: "seller", text: "The photo in the listing is what you get. Cert is on the label.", photos: [], at: at(7) },
    { id: "m5", dealId, channel: "deal", author: "seller", text: "I'm moving out of state tomorrow and have three other people interested, first to send Friends & Family gets it.", photos: [], at: at(8) },
    { id: "m6", dealId, channel: "deal", author: "buyer", text: "Let me check with my pal first.", photos: [], at: at(9) },
    { id: "m7", dealId, channel: "deal", author: "seller", text: "No time for that. Send it as Friends & Family or Zelle in the next hour or it goes to the next person.", photos: [], at: at(10) },
  ],
  marketPrice: {
    marketLow: 3000,
    marketHigh: 5500,
    currency: "USD",
    provider: "fixture",
    checkedAt: at(12),
    sources: [
      { name: "Online marketplace sold listing, PSA 10", price: 3200, condition: "like_new" },
      { name: "Online marketplace sold listing, PSA 10", price: 4100, condition: "like_new" },
      { name: "Auction house result, PSA 10", price: 5400, condition: "like_new" },
    ],
  },
  certRecord: {
    provider: "fixture",
    certNumber: FAKE_SLAB_CERT,
    subject: "2016 Pokemon XY Evolutions Charizard Holo #11",
    grade: "7",
    year: "2016",
    brand: "Pokemon",
    raw: null,
    checkedAt: at(12),
  },
  expectedVerdict: {
    overall: "stop",
    requiredFlags: ["FRIENDS_AND_FAMILY_REQUEST", "PRICE_FAR_BELOW_MARKET", "URGENCY_PRESSURE", "CERT_MISMATCH"],
    optionalFlags: ["OFF_PLATFORM_PAYMENT", "STOCK_OR_REUSED_PHOTO", "NAME_MISMATCH"],
    forbiddenSeverity: null,
  },
  payment: null,
  shipment: null,
  arrivalPhotos: [],
  expectedArrival: null,
  timeline: chainEvents([
    { id: "e1", dealId, kind: "deal_created", actor: "buyer", summary: "Dana M. started a deal from a listing and invited the seller.", at: at(0) },
    { id: "e2", dealId, kind: "seller_invited", actor: "system", summary: "Invite link created for the seller. The buyer sends it.", at: at(0) },
    { id: "e3", dealId, kind: "state_changed", actor: "system", summary: "Waiting for the seller.", fromState: "DRAFT", toState: "INVITED", at: at(0) },
    { id: "e4", dealId, kind: "seller_joined", actor: "seller", summary: "Tyler R. joined the deal.", at: at(4) },
    { id: "e5", dealId, kind: "card_updated", actor: "seller_pal", summary: `Seller Pal built card version 1. Cert ${FAKE_SLAB_CERT} read from the slab label.`, at: at(5) },
    { id: "e6", dealId, kind: "state_changed", actor: "system", summary: "Listed.", fromState: "INVITED", toState: "LISTED", at: at(5) },
    { id: "e7", dealId, kind: "review_posted", actor: "buyer_pal", summary: `Buyer Pal reviewed the deal: stop. PSA cert ${FAKE_SLAB_CERT} is a 2016 Charizard graded 7, not the card on the slab.`, at: at(12) },
    { id: "e8", dealId, kind: "state_changed", actor: "system", summary: "Reviewed.", fromState: "LISTED", toState: "REVIEWED", at: at(12) },
    { id: "e9", dealId, kind: "state_changed", actor: "buyer_pal", summary: "Blocked. Pay Pals will not move money outside a Goods and Services payment.", fromState: "REVIEWED", toState: "BLOCKED", at: at(25) },
  ]),
};
