/**
 * Everything the deal room needs, read from the store in one go, then
 * trimmed to what one side may see (the other pal's private channel is
 * removed). Demo hints come from the scenario fixture and only prefill forms.
 */
import type { ArrivalCheck, ChecklistItem, Deal, DealEvent, ItemCard, Message, PalResult, PaymentRecord, Photo, Shipment, Verdict } from "@pay-pals/contracts";
import { readSeedStamp } from "../demo/seed-version";
import { fixtureById } from "../scenarios";
import { palChannel, type Role } from "../role";
import type { Services } from "../services";
import { notFound } from "./errors";
import { isReviewing } from "./review-registry";
import type { PayPalReadResult } from "./paypal-confirmation";
import { readPayPalOrder } from "./paypal-read";
import { absoluteCard } from "./photo-urls";

export interface DemoHints {
  /** Photos the seller can add when the buyer's pal asks for more. */
  requestPhotos: Photo[];
  packing: { carrier: Shipment["carrier"]; trackingNumber: string; photos: Photo[] } | null;
  arrivalPhotos: Photo[];
}

export interface DealSnapshot {
  deal: Deal;
  cards: ItemCard[];
  currentCard: ItemCard | null;
  lockedCard: ItemCard | null;
  messages: Message[];
  events: DealEvent[];
  /** Every review on record, oldest first. The before-and-after view reads the last two. */
  verdicts: Verdict[];
  /** The latest review, which is the last of `verdicts`. */
  verdict: Verdict | null;
  arrivalCheck: ArrivalCheck | null;
  payment: PaymentRecord | null;
  /**
   * The live GET order from PayPal, done while this snapshot was built. The
   * only thing "Confirmed by PayPal" may sit over.
   */
  paypalRead: PayPalReadResult;
  shipment: Shipment | null;
  hasEvidence: boolean;
  /** Seller Pal's packing list, present once the deal is paid. */
  checklist: ChecklistItem[] | null;
  checklistMessage: string | null;
  demo: DemoHints | null;
  /** Which gateway the server is running. The pay step shows demo buttons whenever this is mock, whatever the public client id says. */
  payMode: "sandbox" | "mock";
  /** The seller declined the invite (recorded on the join page or relayed by the buyer). */
  inviteDeclined: boolean;
  /** Seeded from a scenario (seed stamp on deal_created, or a FIXTURE- order id): an example deal with no PayPal order behind it. */
  example: boolean;
  /** Photo uploads work on this host (a writable public/uploads). */
  uploadsEnabled: boolean;
  /**
   * A Buyer Pal review is running for this deal on this server right now
   * (Decision 19). Covers a reload mid-review, so the room still locks Agree
   * and still says why. Read from the in-process registry, never inferred
   * from the absence of a verdict.
   */
  reviewInFlight: boolean;
  /** The sandbox test buyer to approve with: demo deals on the sandbox gateway only, never real deals, never the mock. */
  sandboxBuyer: { email: string; password: string } | null;
}

export function sandboxBuyerFor(deal: Deal, services: Pick<Services, "modes" | "sandboxBuyer">): { email: string; password: string } | null {
  if (deal.scenario === null || services.modes.paypal !== "sandbox") return null;
  return services.sandboxBuyer;
}

export function isExampleDeal(events: readonly DealEvent[], payment: PaymentRecord | null): boolean {
  if (payment?.paypalOrderId.startsWith("FIXTURE-")) return true;
  return readSeedStamp(events.find((e) => e.kind === "deal_created")?.data) !== null;
}

function demoHints(deal: Deal, currentCard: ItemCard | null): DemoHints | null {
  const fixture = fixtureById(deal.scenario);
  if (!fixture) return null;
  const have = new Set(currentCard?.photos.map((p) => p.url) ?? []);
  const requestPhotos = fixture.cards.flatMap((c) => c.photos).filter((p) => !have.has(p.url));
  const unique = requestPhotos.filter((p, i) => requestPhotos.findIndex((q) => q.url === p.url) === i);
  return {
    requestPhotos: unique,
    packing: fixture.shipment
      ? { carrier: fixture.shipment.carrier, trackingNumber: fixture.shipment.trackingNumber, photos: fixture.shipment.packingPhotos }
      : null,
    arrivalPhotos: fixture.arrivalPhotos,
  };
}

/** The Seller Pal's checklist is asked for once per locked card, not on every page view. */
const checklistCache = new Map<string, PalResult<ChecklistItem[]>>();

export async function loadSnapshot(services: Services, dealId: string): Promise<DealSnapshot> {
  await services.ready;
  const { store } = services;
  const deal = await store.getDeal(dealId);
  if (!deal) throw notFound("Deal");
  const [cards, messages, events, verdicts, arrivalCheck, payment, shipment, evidence] = await Promise.all([
    store.listCards(dealId),
    store.listMessages(dealId),
    store.listEvents(dealId),
    store.listVerdicts(dealId),
    store.getArrivalCheck(dealId),
    store.getPayment(dealId),
    store.getShipment(dealId),
    store.getEvidence(dealId),
  ]);
  const currentCard = cards.find((c) => c.version === deal.currentCardVersion) ?? null;
  const lockedCard = deal.lockedCardVersion ? (cards.find((c) => c.version === deal.lockedCardVersion) ?? null) : null;
  const verdict = verdicts.length > 0 ? (verdicts[verdicts.length - 1] ?? null) : null;
  // One live GET order per render, so the payment panel can say what PayPal confirms rather than what we stored.
  const paypalRead = await readPayPalOrder(services.paypal, payment, services.modes.paypal);

  let checklist: ChecklistItem[] | null = shipment?.checklist ?? null;
  let checklistMessage: string | null = null;
  if (!checklist && deal.state === "PAID" && lockedCard) {
    const key = `${deal.id}:${lockedCard.version}`;
    let result = checklistCache.get(key);
    if (!result) {
      result = await services.sellerPal.shipmentChecklist(deal, absoluteCard(lockedCard));
      checklistCache.set(key, result);
    }
    checklist = result.data;
    checklistMessage = result.palMessage;
  }

  return {
    deal,
    cards,
    currentCard,
    lockedCard,
    messages: [...messages].sort((a, b) => a.at.localeCompare(b.at)),
    events,
    verdicts: [...verdicts],
    verdict,
    arrivalCheck,
    payment,
    paypalRead,
    shipment,
    hasEvidence: evidence !== null,
    checklist,
    checklistMessage,
    demo: demoHints(deal, currentCard),
    payMode: services.modes.paypal,
    inviteDeclined: events.some((e) => e.kind === "invite_declined"),
    example: isExampleDeal(events, payment),
    uploadsEnabled: services.uploadsEnabled,
    reviewInFlight: isReviewing(dealId),
    sandboxBuyer: sandboxBuyerFor(deal, services),
  };
}

/** Remove the other side's private pal channel. */
export function snapshotForRole(snapshot: DealSnapshot, role: Role): DealSnapshot {
  const mine = palChannel(role);
  return { ...snapshot, messages: snapshot.messages.filter((m) => m.channel === "deal" || m.channel === mine) };
}
