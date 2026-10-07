/**
 * Row <-> contract conversions. Dollars become integer cents, Dates become
 * ISO strings, and the deal's two parties are flattened into columns.
 */
import type {
  ArrivalCheck,
  Deal,
  DealEvent,
  EvidencePack,
  ItemCard,
  Message,
  PaymentRecord,
  Shipment,
  Verdict,
} from "@pay-pals/contracts";
import { fromCents, toCents } from "../money";
import type { dealEvents, deals, evidencePacks, itemCards, messages, payments, shipments, verdicts } from "../../schema";

type DealRow = typeof deals.$inferSelect;
type CardRow = typeof itemCards.$inferSelect;
type MessageRow = typeof messages.$inferSelect;
type EventRow = typeof dealEvents.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;
type ShipmentRow = typeof shipments.$inferSelect;
type VerdictRow = typeof verdicts.$inferSelect;
type EvidenceRow = typeof evidencePacks.$inferSelect;

const iso = (d: Date): string => d.toISOString();
const isoOrNull = (d: Date | null): string | null => (d ? d.toISOString() : null);
const date = (s: string): Date => new Date(s);
const dateOrNull = (s: string | null): Date | null => (s ? new Date(s) : null);

export function toDeal(row: DealRow): Deal {
  return {
    id: row.id,
    state: row.state,
    scenario: row.scenario,
    seller: { role: "seller", displayName: row.sellerName, email: row.sellerEmail },
    buyer: row.buyerEmail ? { role: "buyer", displayName: row.buyerName ?? "", email: row.buyerEmail } : null,
    currentCardVersion: row.currentCardVersion,
    lockedCardVersion: row.lockedCardVersion,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toCard(row: CardRow): ItemCard {
  return {
    dealId: row.dealId,
    version: row.version,
    title: row.title,
    brand: row.brand,
    model: row.model,
    serial: row.serial,
    conditionGrade: row.conditionGrade,
    conditionNotes: row.conditionNotes,
    included: row.included,
    photos: row.photos,
    askingPrice: fromCents(row.askingPriceCents),
    currency: row.currency as ItemCard["currency"],
    sellerPaypalEmail: row.sellerPaypalEmail,
    lockedAt: isoOrNull(row.lockedAt),
  };
}

export function toCardRow(card: ItemCard): typeof itemCards.$inferInsert {
  return {
    dealId: card.dealId,
    version: card.version,
    title: card.title,
    brand: card.brand,
    model: card.model,
    serial: card.serial,
    conditionGrade: card.conditionGrade,
    conditionNotes: card.conditionNotes,
    included: card.included,
    photos: card.photos,
    askingPriceCents: toCents(card.askingPrice),
    currency: card.currency,
    sellerPaypalEmail: card.sellerPaypalEmail,
    lockedAt: null,
  };
}

export function toMessage(row: MessageRow): Message {
  return { id: row.id, dealId: row.dealId, channel: row.channel, author: row.author, text: row.text, photos: row.photos, at: iso(row.at) };
}

export function toMessageRow(m: Omit<Message, "id">): typeof messages.$inferInsert {
  return { dealId: m.dealId, channel: m.channel, author: m.author, text: m.text, photos: m.photos ?? [], at: date(m.at) };
}

export function toEvent(row: EventRow): DealEvent {
  const event: DealEvent = { id: row.id, dealId: row.dealId, kind: row.kind, actor: row.actor, summary: row.summary, at: iso(row.at) };
  if (row.fromState) event.fromState = row.fromState;
  if (row.toState) event.toState = row.toState;
  if (row.data) event.data = row.data;
  return event;
}

export function toEventRow(e: Omit<DealEvent, "id">): typeof dealEvents.$inferInsert {
  return {
    dealId: e.dealId,
    kind: e.kind,
    actor: e.actor,
    summary: e.summary,
    fromState: e.fromState ?? null,
    toState: e.toState ?? null,
    data: e.data ?? null,
    at: date(e.at),
  };
}

export function toPayment(row: PaymentRow): PaymentRecord {
  return {
    dealId: row.dealId,
    paypalOrderId: row.paypalOrderId,
    captureId: row.captureId,
    status: row.status,
    payeeEmail: row.payeeEmail,
    amount: fromCents(row.amountCents),
    currency: "USD",
    method: row.method,
    createdAt: iso(row.createdAt),
    capturedAt: isoOrNull(row.capturedAt),
  };
}

export function toPaymentRow(p: PaymentRecord): typeof payments.$inferInsert {
  return {
    dealId: p.dealId,
    paypalOrderId: p.paypalOrderId,
    captureId: p.captureId,
    status: p.status,
    payeeEmail: p.payeeEmail,
    amountCents: toCents(p.amount),
    currency: p.currency,
    method: p.method,
    createdAt: date(p.createdAt),
    capturedAt: dateOrNull(p.capturedAt),
  };
}

export function toShipment(row: ShipmentRow): Shipment {
  return {
    dealId: row.dealId,
    carrier: row.carrier,
    trackingNumber: row.trackingNumber,
    packingPhotos: row.packingPhotos,
    checklist: row.checklist,
    shippedAt: iso(row.shippedAt),
    deliveredAt: isoOrNull(row.deliveredAt),
  };
}

export function toShipmentRow(s: Shipment): typeof shipments.$inferInsert {
  return {
    dealId: s.dealId,
    carrier: s.carrier,
    trackingNumber: s.trackingNumber,
    packingPhotos: s.packingPhotos,
    checklist: s.checklist,
    shippedAt: date(s.shippedAt),
    deliveredAt: dateOrNull(s.deliveredAt),
  };
}

export function toVerdictRow(v: Verdict): typeof verdicts.$inferInsert {
  return { dealId: v.dealId, kind: "review", cardVersion: v.cardVersion, outcome: v.overall, payload: v, createdAt: date(v.createdAt) };
}

export function toArrivalRow(c: ArrivalCheck): typeof verdicts.$inferInsert {
  return { dealId: c.dealId, kind: "arrival", cardVersion: c.cardVersion, outcome: c.matches ? "match" : "mismatch", payload: c, createdAt: date(c.createdAt) };
}

export const toVerdict = (row: VerdictRow): Verdict => row.payload as Verdict;
export const toArrival = (row: VerdictRow): ArrivalCheck => row.payload as ArrivalCheck;

export function toEvidenceRow(p: EvidencePack): typeof evidencePacks.$inferInsert {
  return { dealId: p.dealId, builtBy: p.builtBy, summary: p.summary, pack: p, createdAt: date(p.builtAt) };
}

export const toEvidence = (row: EvidenceRow): EvidencePack => row.pack;
