/**
 * In-memory DealStore. No database. Used by demo mode, unit tests and the
 * conformance suite. Same rules as the Postgres store: the transition table
 * is enforced, state changes append a state_changed event, and a locked card
 * never changes.
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
  Shipment,
  Verdict,
} from "@pay-pals/contracts";
import { CardLockedError, CardNotFoundError, CardVersionError, DealNotFoundError } from "../errors";
import { planTransition } from "../state-machine";
import type { PayPalsStore } from "../store-types";

interface DealRecord {
  deal: Deal;
  cards: ItemCard[];
  messages: Message[];
  verdicts: Verdict[];
  arrivalChecks: ArrivalCheck[];
  payments: PaymentRecord[];
  shipment: Shipment | null;
  evidence: EvidencePack[];
  events: DealEvent[];
}

const copy = <T>(value: T): T => structuredClone(value);
const now = () => new Date().toISOString();
const byTime = <T extends { at: string }>(a: T, b: T) => Date.parse(a.at) - Date.parse(b.at);

export function createMemoryDealStore(): PayPalsStore {
  const records = new Map<string, DealRecord>();
  const receipts = new Map<string, string>();

  const must = (dealId: string): DealRecord => {
    const rec = records.get(dealId);
    if (!rec) throw new DealNotFoundError(dealId);
    return rec;
  };

  const pushEvent = (rec: DealRecord, event: Omit<DealEvent, "id">): DealEvent => {
    const stored: DealEvent = { id: crypto.randomUUID(), ...copy(event) };
    rec.events.push(stored);
    return copy(stored);
  };

  return {
    async createDeal(input: CreateDealInput): Promise<Deal> {
      const at = now();
      const deal: Deal = {
        id: crypto.randomUUID(),
        state: "DRAFT",
        scenario: input.scenario ?? null,
        seller: copy(input.seller),
        buyer: input.buyer ? copy(input.buyer) : null,
        currentCardVersion: 0,
        lockedCardVersion: null,
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

    async setBuyer(dealId: string, buyer: Party): Promise<Deal> {
      const rec = must(dealId);
      rec.deal.buyer = copy(buyer);
      rec.deal.updatedAt = now();
      return copy(rec.deal);
    },

    async transition(dealId: string, to: DealState, actor: DealEvent["actor"], summary: string): Promise<Deal> {
      const rec = must(dealId);
      const plan = planTransition(rec.deal, to, actor, summary);
      rec.deal.state = plan.to;
      rec.deal.updatedAt = plan.event.at;
      pushEvent(rec, plan.event);
      return copy(rec.deal);
    },

    async saveCard(card: ItemCard): Promise<ItemCard> {
      const rec = must(card.dealId);
      if (rec.deal.lockedCardVersion !== null) throw new CardLockedError(card.dealId, rec.deal.lockedCardVersion);
      const expected = rec.deal.currentCardVersion + 1;
      if (card.version !== expected) throw new CardVersionError(card.dealId, expected, card.version);
      const stored = { ...copy(card), lockedAt: null };
      rec.cards.push(stored);
      rec.deal.currentCardVersion = card.version;
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
      return copy([...list].sort(byTime));
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
      const idx = rec.payments.findIndex((p) => p.paypalOrderId === payment.paypalOrderId);
      if (idx >= 0) rec.payments[idx] = copy(payment);
      else rec.payments.push(copy(payment));
      return copy(payment);
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
      must(shipment.dealId).shipment = copy(shipment);
      return copy(shipment);
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

    async appendEvent(event: Omit<DealEvent, "id">): Promise<DealEvent> {
      return pushEvent(must(event.dealId), event);
    },

    async listEvents(dealId: string): Promise<DealEvent[]> {
      const rec = records.get(dealId);
      return rec ? copy([...rec.events].sort(byTime)) : [];
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
