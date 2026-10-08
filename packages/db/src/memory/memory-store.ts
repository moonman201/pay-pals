/**
 * In-memory DealStore. No database. Used by demo mode, unit tests and the
 * conformance suite. Same rules as the Postgres store: the transition table
 * is enforced, every appended event joins the deal's hash chain, state
 * changes append a state_changed event, and a locked card never changes.
 * Every timestamp the store generates comes from the clock it was given.
 *
 * Every method returns a copy, so callers cannot change stored data by
 * accident.
 */
import type {
  ArrivalCheck,
  CreateDealInput,
  Deal,
  DealEvent,
  DealState,
  EvidencePack,
  ItemCard,
  Message,
  MessageChannel,
  Party,
  PaymentRecord,
  ScenarioId,
  Shipment,
  Verdict,
} from "@pay-pals/contracts";
import type { PayPalsStore } from "@pay-pals/contracts";
import {
  agreedEvent,
  agreementField,
  assertAgreementAllowed,
  assertCardLockable,
  assertCardSavable,
  assertSellerMayJoin,
  mergeSeller,
  sellerJoinedEvent,
} from "../card-rules";
import { systemClock, type StoreOptions } from "../clock";
import { CardLockedError, CardNotFoundError, CardVersionError, DealNotFoundError, EventOutOfOrderError } from "../errors";
import { chainNext, type NewEvent } from "../event-chain";
import { uuidv7 } from "../postgres/uuid";
import { planTransition } from "../state-machine";

interface DealRecord {
  deal: Deal;
  cards: ItemCard[];
  messages: Message[];
  verdicts: Verdict[];
  arrivalChecks: ArrivalCheck[];
  payments: PaymentRecord[];
  shipment: Shipment | null;
  evidence: EvidencePack[];
  /** Kept in chain order: by at, then id, which is also append order. */
  events: DealEvent[];
}

const copy = <T>(value: T): T => structuredClone(value);
const byTimeThenId = <T extends { at: string; id: string }>(a: T, b: T) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id);

export function createMemoryDealStore(options: StoreOptions = {}): PayPalsStore {
  const clock = options.clock ?? systemClock;
  const now = () => clock().toISOString();
  const records = new Map<string, DealRecord>();
  const receipts = new Map<string, string>();

  const must = (dealId: string): DealRecord => {
    const rec = records.get(dealId);
    if (!rec) throw new DealNotFoundError(dealId);
    return rec;
  };

  /**
   * Appends to the chain. Synchronous on purpose: no await between reading
   * the head and writing. Ids are time-ordered (same as Postgres) so events
   * written in one millisecond keep insertion order under the (at, id) sort.
   * An event earlier than the current head is refused: it would fork the chain.
   */
  const pushEvent = (rec: DealRecord, event: NewEvent): DealEvent => {
    const latest = rec.events[rec.events.length - 1];
    if (latest && Date.parse(event.at) < Date.parse(latest.at)) throw new EventOutOfOrderError(rec.deal.id, event.at, latest.at);
    const stored: DealEvent = { id: uuidv7(), ...copy(event), ...chainNext(latest?.hash ?? null, event) };
    rec.events.push(stored);
    rec.events.sort(byTimeThenId);
    return copy(stored);
  };

  return {
    async createDeal(input: CreateDealInput): Promise<Deal> {
      const at = now();
      const deal: Deal = {
        id: crypto.randomUUID(),
        state: "DRAFT",
        scenario: input.scenario ?? null,
        startedBy: input.startedBy,
        listingUrl: input.listingUrl ?? null,
        seller: copy(input.seller),
        buyer: input.buyer ? copy(input.buyer) : null,
        sellerJoinedAt: null,
        currentCardVersion: 0,
        lockedCardVersion: null,
        buyerAgreedAt: null,
        sellerAgreedAt: null,
        createdAt: at,
        updatedAt: at,
      };
      records.set(deal.id, {
        deal,
        cards: [],
        messages: [],
        verdicts: [],
        arrivalChecks: [],
        payments: [],
        shipment: null,
        evidence: [],
        events: [],
      });
      return copy(deal);
    },

    async getDeal(dealId: string): Promise<Deal | null> {
      const rec = records.get(dealId);
      return rec ? copy(rec.deal) : null;
    },

    async findDeals(query: { scenario?: ScenarioId | null; states?: readonly DealState[] }): Promise<Deal[]> {
      const matches = [...records.values()]
        .map((rec) => rec.deal)
        .filter((deal) => query.scenario === undefined || deal.scenario === query.scenario)
        .filter((deal) => query.states === undefined || query.states.includes(deal.state))
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
      return copy(matches);
    },

    async setBuyer(dealId: string, buyer: Party): Promise<Deal> {
      const rec = must(dealId);
      rec.deal.buyer = copy(buyer);
      rec.deal.updatedAt = now();
      return copy(rec.deal);
    },

    async markSellerJoined(dealId: string, seller?: Partial<Party>): Promise<Deal> {
      const rec = must(dealId);
      assertSellerMayJoin(dealId, rec.deal.state);
      if (rec.deal.sellerJoinedAt === null) {
        const at = now();
        rec.deal.seller = mergeSeller(rec.deal.seller, seller);
        rec.deal.sellerJoinedAt = at;
        rec.deal.updatedAt = at;
        pushEvent(rec, sellerJoinedEvent(rec.deal, at));
      }
      return copy(rec.deal);
    },

    async recordAgreement(dealId: string, role: "buyer" | "seller", at: string = now()): Promise<Deal> {
      const rec = must(dealId);
      assertAgreementAllowed(dealId, rec.deal.state);
      const field = agreementField(role);
      if (rec.deal[field] === null) {
        rec.deal[field] = at;
        rec.deal.updatedAt = at;
        pushEvent(rec, agreedEvent(rec.deal, role, at));
      }
      return copy(rec.deal);
    },

    async transition(dealId: string, to: DealState, actor: DealEvent["actor"], summary: string): Promise<Deal> {
      const rec = must(dealId);
      const plan = planTransition(rec.deal, to, actor, summary, now());
      pushEvent(rec, plan.event);
      rec.deal.state = plan.to;
      rec.deal.updatedAt = plan.event.at;
      return copy(rec.deal);
    },

    async saveCard(card: ItemCard): Promise<ItemCard> {
      const rec = must(card.dealId);
      if (rec.deal.lockedCardVersion !== null) throw new CardLockedError(card.dealId, rec.deal.lockedCardVersion);
      assertCardSavable(card.dealId, rec.deal.state);
      const expected = rec.deal.currentCardVersion + 1;
      if (card.version !== expected) throw new CardVersionError(card.dealId, expected, card.version);
      const stored = { ...copy(card), lockedAt: null };
      rec.cards.push(stored);
      rec.deal.currentCardVersion = card.version;
      // A changed card needs fresh agreement from both sides.
      rec.deal.buyerAgreedAt = null;
      rec.deal.sellerAgreedAt = null;
      rec.deal.updatedAt = now();
      return copy(stored);
    },

    async getCard(dealId: string, version: number): Promise<ItemCard | null> {
      const rec = records.get(dealId);
      const card = rec?.cards.find((c) => c.version === version);
      return card ? copy(card) : null;
    },

    async getCurrentCard(dealId: string): Promise<ItemCard | null> {
      const rec = records.get(dealId);
      if (!rec || rec.cards.length === 0) return null;
      return copy(rec.cards[rec.cards.length - 1]!);
    },

    async listCards(dealId: string): Promise<ItemCard[]> {
      const rec = records.get(dealId);
      return rec ? copy(rec.cards) : [];
    },

    async lockCard(dealId: string, version: number): Promise<ItemCard> {
      const rec = must(dealId);
      const card = rec.cards.find((c) => c.version === version);
      if (!card) throw new CardNotFoundError(dealId, version);
      if (rec.deal.lockedCardVersion !== null && rec.deal.lockedCardVersion !== version) {
        throw new CardLockedError(dealId, rec.deal.lockedCardVersion);
      }
      assertCardLockable(dealId, rec.deal.state);
      if (version !== rec.deal.currentCardVersion) throw new CardVersionError(dealId, rec.deal.currentCardVersion, version);
      if (card.lockedAt === null) {
        card.lockedAt = now();
        rec.deal.lockedCardVersion = version;
        rec.deal.updatedAt = card.lockedAt;
      }
      return copy(card);
    },

    async addMessage(message: Omit<Message, "id">): Promise<Message> {
      const rec = must(message.dealId);
      const stored: Message = { id: crypto.randomUUID(), ...copy(message), photos: copy(message.photos ?? []) };
      rec.messages.push(stored);
      return copy(stored);
    },

    async listMessages(dealId: string, channel?: MessageChannel): Promise<Message[]> {
      const rec = records.get(dealId);
      if (!rec) return [];
      const list = channel ? rec.messages.filter((m) => m.channel === channel) : rec.messages;
      return copy([...list].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)));
    },

    async saveVerdict(verdict: Verdict): Promise<Verdict> {
      must(verdict.dealId).verdicts.push(copy(verdict));
      return copy(verdict);
    },

    async listVerdicts(dealId: string): Promise<Verdict[]> {
      const rec = records.get(dealId);
      return rec ? copy(rec.verdicts) : [];
    },

    async saveArrivalCheck(check: ArrivalCheck): Promise<ArrivalCheck> {
      must(check.dealId).arrivalChecks.push(copy(check));
      return copy(check);
    },

    async getArrivalCheck(dealId: string): Promise<ArrivalCheck | null> {
      const rec = records.get(dealId);
      const last = rec?.arrivalChecks[rec.arrivalChecks.length - 1];
      return last ? copy(last) : null;
    },

    async savePayment(payment: PaymentRecord): Promise<PaymentRecord> {
      const rec = must(payment.dealId);
      // Same shape as the Postgres store: optional fields are always present, null when unknown.
      const stored: PaymentRecord = {
        ...copy(payment),
        rawOrder: payment.rawOrder ?? null,
        rawCapture: payment.rawCapture ?? null,
        historyHash: payment.historyHash ?? null,
      };
      const idx = rec.payments.findIndex((p) => p.paypalOrderId === payment.paypalOrderId);
      if (idx >= 0) rec.payments[idx] = stored;
      else rec.payments.push(stored);
      return copy(stored);
    },

    async getPayment(dealId: string): Promise<PaymentRecord | null> {
      const rec = records.get(dealId);
      const last = rec?.payments[rec.payments.length - 1];
      return last ? copy(last) : null;
    },

    async getPaymentByOrderId(paypalOrderId: string): Promise<PaymentRecord | null> {
      for (const rec of records.values()) {
        const found = rec.payments.find((p) => p.paypalOrderId === paypalOrderId);
        if (found) return copy(found);
      }
      return null;
    },

    async saveShipment(shipment: Shipment): Promise<Shipment> {
      // Same shape as the Postgres store: flags are always present, [] when none were raised.
      const stored: Shipment = { ...copy(shipment), flags: copy(shipment.flags ?? []) };
      must(shipment.dealId).shipment = stored;
      return copy(stored);
    },

    async getShipment(dealId: string): Promise<Shipment | null> {
      const rec = records.get(dealId);
      return rec?.shipment ? copy(rec.shipment) : null;
    },

    async saveEvidence(pack: EvidencePack): Promise<EvidencePack> {
      must(pack.dealId).evidence.push(copy(pack));
      return copy(pack);
    },

    async getEvidence(dealId: string): Promise<EvidencePack | null> {
      const rec = records.get(dealId);
      const last = rec?.evidence[rec.evidence.length - 1];
      return last ? copy(last) : null;
    },

    async appendEvent(event: NewEvent): Promise<DealEvent> {
      return pushEvent(must(event.dealId), event);
    },

    async listEvents(dealId: string): Promise<DealEvent[]> {
      const rec = records.get(dealId);
      return rec ? copy(rec.events) : [];
    },

    async hasWebhookReceipt(eventId: string): Promise<boolean> {
      return receipts.has(eventId);
    },

    async recordWebhookReceipt(eventId: string, eventType: string): Promise<boolean> {
      if (receipts.has(eventId)) return false;
      receipts.set(eventId, eventType);
      return true;
    },

    async releaseWebhookReceipt(eventId: string): Promise<void> {
      receipts.delete(eventId);
    },
  };
}
