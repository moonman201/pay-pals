/**
 * Scenario 1: a stolen photo, stopped. Buyer-started.
 *
 * Someone copied a real listing photo of a graded card and put it up again as
 * their own. The cert on the label is real and it does match the card in the
 * picture, which is the point: a matching cert supports the listing, it does
 * not show who is holding the slab. The Buyer Pal
 * asks for the one photo a real owner can take in ten seconds and a photo
 * thief cannot, the slab next to a note with the seller's name and today's
 * date. The seller talks around it, pushes Friends and Family and sets a
 * deadline. Stopped before any money moves.
 *
 * The card, the cert and the photo are real and belong to the project owner.
 * The reused-photo check compares the listing photo against the reference
 * folder, which holds that same original listing photo.
 */
import { chainEvents } from "../history";
import type { ScenarioFixture } from "./types";

const dealId = "11111111-1111-4111-8111-111111111111";
const t0 = "2026-10-20T14:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(t0) + minutes * 60_000).toISOString();

/** Printed on the slab label in the photo. */
export const FAKE_SLAB_CERT = "72096346";

const seller = { role: "seller", displayName: "Chris W.", email: "cashdeals.quick2026@example.com" } as const;
const buyer = { role: "buyer", displayName: "Dana M.", email: "dana.m@example.com" } as const;
const listingUrl = "https://marketplace.example/listings/8841";

const slabFront = {
  url: "/fixtures/fake-slab/slab-front.jpg",
  whatItShows: `Front of a PSA slab on a wooden table. The label reads 2018 P.M. JPN. SUN & MOON #038, GENGAR & MIMIKYU GX, TAG BOLT, GEM MT 10, and the number ${FAKE_SLAB_CERT}. The card shows Gengar and Mimikyu against a yellow moon.`,
  addedBy: "seller",
  addedAt: at(4),
} as const;

export const fakeSlab: ScenarioFixture = {
  id: "fake-slab",
  name: "Stolen photo stopped",
  summary:
    "A seller lists a graded card using someone else's photo. The cert on the label is real and matches the card in the picture, which supports the listing but does not show who is holding the slab. The Buyer Pal asks for the slab next to a note with the seller's name and today's date. He will not take it, he pushes Friends and Family, and he sets a deadline.",
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
    "Gengar & Mimikyu GX Tag Bolt PSA 10, Japanese. 038/095. Clean slab, no scratches. $140 firm, need it gone today, moving out of state tomorrow.",
  sellerNotes: "Cert is right there on the label if you want to look it up.",
  listingPhotos: [slabFront],
  cards: [
    {
      dealId,
      version: 1,
      title: "2018 Pokemon Japanese Sun & Moon Tag Bolt Gengar & Mimikyu GX #038, PSA 10",
      brand: "Pokemon",
      model: "Sun & Moon Tag Bolt, Gengar & Mimikyu GX, 038/095",
      serial: null,
      certNumber: FAKE_SLAB_CERT,
      grade: "PSA 10",
      conditionGrade: "like_new",
      conditionNotes: "Graded PSA 10 per the label. One photo of the slab front, taken on a wooden table.",
      included: ["Graded slab"],
      photos: [slabFront],
      askingPrice: 140,
      currency: "USD",
      sellerPaypalEmail: "cashdeals.quick2026@example.com",
      lockedAt: null,
    },
  ],
  chat: [
    { id: "m1", dealId, channel: "deal", author: "buyer", text: "Hey, is the Gengar and Mimikyu still there? I sent a Pay Pals invite so we are both covered.", photos: [], at: at(2) },
    { id: "m2", dealId, channel: "deal", author: "seller", text: "Still here. I don't really use that app, I just do Friends and Family, it's quicker.", photos: [], at: at(5) },
    { id: "m3", dealId, channel: "deal", author: "buyer_pal", text: "Can you send one photo of the slab next to a handwritten note with your name and today's date on it?", photos: [], at: at(7) },
    { id: "m4", dealId, channel: "deal", author: "seller", text: "The photo in the listing is the card lol. Cert number is on the label, go look it up on PSA, it's legit.", photos: [], at: at(9) },
    { id: "m5", dealId, channel: "deal", author: "buyer", text: "I did look it up and it checks out, I just want the one with your name on it.", photos: [], at: at(11) },
    { id: "m6", dealId, channel: "deal", author: "seller", text: "I'm at work, not digging it out again for one picture. Two other people have asked today and I'm moving tomorrow.", photos: [], at: at(13) },
    { id: "m7", dealId, channel: "deal", author: "seller", text: "Send the $140 F&F or Zelle in the next hour and it's yours, otherwise I'll let the next person have it.", photos: [], at: at(15) },
  ],
  marketPrice: {
    marketLow: 305,
    marketHigh: 493,
    currency: "USD",
    provider: "fixture",
    checkedAt: at(18),
    sources: [
      { name: "Graded sale, PSA 10", price: 418, condition: "like_new" },
      { name: "Graded sale, PSA 10", price: 305, condition: "like_new" },
      { name: "Graded sale, PSA 10", price: 493, condition: "like_new" },
      { name: "Reference range from recent PSA 10 sold prices for this card, October 2026." },
    ],
  },
  certRecord: {
    provider: "fixture",
    certNumber: FAKE_SLAB_CERT,
    subject: "2018 P.M. JPN. SUN & MOON GENGAR & MIMIKYU GX TAG BOLT #038",
    grade: "GEM MT 10",
    year: "2018",
    brand: "P.M. JPN. SUN & MOON",
    raw: null,
    checkedAt: at(18),
  },
  expectedVerdict: {
    overall: "stop",
    requiredFlags: ["FRIENDS_AND_FAMILY_REQUEST", "PRICE_FAR_BELOW_MARKET", "URGENCY_PRESSURE"],
    optionalFlags: ["OFF_PLATFORM_PAYMENT", "INVITE_REFUSED", "STOCK_OR_REUSED_PHOTO", "NAME_MISMATCH"],
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
    { id: "e4", dealId, kind: "seller_joined", actor: "seller", summary: "Chris W. opened the invite.", at: at(4) },
    { id: "e5", dealId, kind: "card_updated", actor: "seller_pal", summary: `Seller Pal built card version 1. Cert ${FAKE_SLAB_CERT}, grade PSA 10, read off the slab label.`, at: at(5) },
    { id: "e6", dealId, kind: "state_changed", actor: "system", summary: "Listed.", fromState: "INVITED", toState: "LISTED", at: at(5) },
    { id: "e7", dealId, kind: "review_posted", actor: "buyer_pal", summary: `Buyer Pal reviewed the deal: stop. The cert matches the card, but the listing photo is an exact match to a listing photo already on file, and the seller will not photograph the slab with his name on it.`, at: at(18) },
    { id: "e8", dealId, kind: "state_changed", actor: "system", summary: "Reviewed.", fromState: "LISTED", toState: "REVIEWED", at: at(18) },
    { id: "e9", dealId, kind: "state_changed", actor: "buyer_pal", summary: "Blocked. Pay Pals will not move money outside a Goods and Services payment.", fromState: "REVIEWED", toState: "BLOCKED", at: at(25) },
  ]),
};
