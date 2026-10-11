/**
 * Row <-> contract conversions. Dollars become integer cents, Dates become
 * ISO strings, and the deal's two parties are flattened into columns.
 */
import type {
  ArrivalCheck,
  ArrivalOutcome,
  Deal,
  DealEvent,
  EvidencePack,
  ItemCard,
  Message,
  PaymentRecord,
  Shipment,
  Verdict,
} from "@pay-pals/contracts";
import { ARRIVAL_OUTCOMES } from "@pay-pals/contracts";
import { EventNotHashedError } from "../errors";
import type { NewEvent } from "../event-chain";
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
    startedBy: row.startedBy,
    listingUrl: row.listingUrl,
    seller: { role: "seller", displayName: row.sellerName, email: row.sellerEmail },
    buyer: row.buyerEmail ? { role: "buyer", displayName: row.buyerName ?? "", email: row.buyerEmail } : null,
    sellerJoinedAt: isoOrNull(row.sellerJoinedAt),
    currentCardVersion: row.currentCardVersion,
    lockedCardVersion: row.lockedCardVersion,
    buyerAgreedAt: isoOrNull(row.buyerAgreedAt),
    sellerAgreedAt: isoOrNull(row.sellerAgreedAt),
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
    boxSerial: row.boxSerial,
    certNumber: row.certNumber,
    grade: row.grade,
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
    boxSerial: card.boxSerial ?? null,
    certNumber: card.certNumber ?? null,
    grade: card.grade ?? null,
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
  if (row.hash === null) throw new EventNotHashedError(row.id);
  const event: DealEvent = {
    id: row.id,
    dealId: row.dealId,
    kind: row.kind,
    actor: row.actor,
    summary: row.summary,
    at: iso(row.at),
    prevHash: row.prevHash,
    hash: row.hash,
  };
  if (row.fromState) event.fromState = row.fromState;
  if (row.toState) event.toState = row.toState;
  if (row.data) event.data = row.data;
  return event;
}

/** Everything but the chain fields; events.ts adds id, prevHash and hash. */
export function toEventRow(e: NewEvent): Omit<typeof dealEvents.$inferInsert, "hash" | "prevHash"> {
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
    rawOrder: row.rawOrder ?? null,
    rawCapture: row.rawCapture ?? null,
    historyHash: row.historyHash ?? null,
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
    rawOrder: p.rawOrder ?? null,
    rawCapture: p.rawCapture ?? null,
    historyHash: p.historyHash ?? null,
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
    flags: row.flags ?? [],
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
    flags: s.flags ?? [],
  };
}

export function toVerdictRow(v: Verdict): typeof verdicts.$inferInsert {
  return { dealId: v.dealId, kind: "review", cardVersion: v.cardVersion, outcome: v.overall, payload: v, createdAt: date(v.createdAt) };
}

/**
 * The outcome column takes the contract's three values as they are, so an
 * inconclusive check is stored as "inconclusive" and not folded into one of
 * the other two. This row is never updated in place, so a value written here
 * is the permanent record of what the pal concluded.
 */
export function toArrivalRow(c: ArrivalCheck): typeof verdicts.$inferInsert {
  return { dealId: c.dealId, kind: "arrival", cardVersion: c.cardVersion, outcome: c.outcome, payload: c, createdAt: date(c.createdAt) };
}

export const toVerdict = (row: VerdictRow): Verdict => row.payload as Verdict;

/**
 * The outcome of a stored arrival payload, translating rows written before
 * contracts v1.8.0.
 *
 * `matches` was renamed to `outcome`, not added alongside it, so every arrival
 * check already in the database carries `matches` and no `outcome`. The payload
 * is read with a cast and not a parse, so without this those rows would hand a
 * reader `outcome: undefined` under a type that says it cannot be.
 *
 * `matches: true` becomes "match" and `false` becomes "mismatch". That is
 * faithful rather than a guess: when those rows were written there were only
 * two answers a check could give.
 *
 * Everything else lands on "inconclusive": a payload that is not an object, one
 * carrying neither field, or an `outcome` string that is not one of the three.
 * Nothing unrecognised is allowed to read as "match", because that would turn a
 * storage artefact into a reassuring claim about someone's parcel (Decision 20).
 */
function arrivalOutcomeOf(payload: unknown): ArrivalOutcome {
  if (typeof payload !== "object" || payload === null) return "inconclusive";
  const { outcome, matches } = payload as { outcome?: unknown; matches?: unknown };
  if (typeof outcome === "string" && (ARRIVAL_OUTCOMES as readonly string[]).includes(outcome)) return outcome as ArrivalOutcome;
  if (matches === true) return "match";
  if (matches === false) return "mismatch";
  return "inconclusive";
}

/**
 * Every stored arrival check passes through here, so the legacy shape is
 * translated once at this boundary rather than in each reader (Decision 15).
 * `matches` is dropped on the way out, so a caller only ever sees the current
 * shape and cannot read the old field by accident.
 *
 * A legacy row translated to "inconclusive" carries no `unsettled` list, since
 * there is nothing in the row to build one from and inventing entries would be
 * a claim the stored check never made.
 *
 * The legacy branch can be deleted once no arrival rows written before v1.8.0
 * remain. The final deploy re-seeds the demo deals and clears the probe deals,
 * which rewrites those in the new shape; any arrival check on a deal that
 * neither path reaches keeps the branch needed. This finds them, read only:
 *   select id, deal_id from verdicts
 *   where kind = 'arrival' and payload->>'outcome' is null;
 */
export function toArrival(row: VerdictRow): ArrivalCheck {
  const payload = row.payload as ArrivalCheck & { matches?: unknown };
  const outcome = arrivalOutcomeOf(payload);
  if (typeof payload !== "object" || payload === null) return { outcome } as ArrivalCheck;
  const { matches: _legacyMatches, ...rest } = payload;
  return { ...rest, outcome };
}

export function toEvidenceRow(p: EvidencePack): typeof evidencePacks.$inferInsert {
  return { dealId: p.dealId, builtBy: p.builtBy, summary: p.summary, pack: p, createdAt: date(p.builtAt) };
}

export const toEvidence = (row: EvidenceRow): EvidencePack => row.pack;
