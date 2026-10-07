/**
 * Everything the deal room needs, read from the store in one go, then
 * trimmed to what one side may see (the other pal's private channel is
 * removed). Demo hints come from the scenario fixture and only prefill forms.
 */
import type { ArrivalCheck, ChecklistItem, Deal, DealEvent, ItemCard, Message, PaymentRecord, Photo, Shipment, Verdict } from "@pay-pals/contracts";
import { fixtureById } from "../mocks/fixture-match";
import { palChannel, type Role } from "../role";
import type { Services } from "../services";
import { notFound } from "./errors";

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
  verdict: Verdict | null;
  arrivalCheck: ArrivalCheck | null;
  payment: PaymentRecord | null;
  shipment: Shipment | null;
  hasEvidence: boolean;
  /** Seller Pal's packing list, present once the deal is paid. */
  checklist: ChecklistItem[] | null;
  checklistMessage: string | null;
  demo: DemoHints | null;
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

  let checklist: ChecklistItem[] | null = shipment?.checklist ?? null;
  let checklistMessage: string | null = null;
  if (!checklist && deal.state === "PAID" && lockedCard) {
    const result = await services.sellerPal.shipmentChecklist(deal, lockedCard);
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
    verdict,
    arrivalCheck,
    payment,
    shipment,
    hasEvidence: evidence !== null,
    checklist,
    checklistMessage,
    demo: demoHints(deal, currentCard),
  };
}

/** Remove the other side's private pal channel. */
export function snapshotForRole(snapshot: DealSnapshot, role: Role): DealSnapshot {
  const mine = palChannel(role);
  return { ...snapshot, messages: snapshot.messages.filter((m) => m.channel === "deal" || m.channel === mine) };
}
