/**
 * In-memory DealStore for demo mode and tests. State lives for the life of
 * the server process. Enforces the contract's transition table and the
 * locked-card rule. packages/db replaces this behind lib/services.ts.
 */
import {
  assertTransition,
  type ArrivalCheck,
  type CreateDealInput,
  type Deal,
  type DealEvent,
  type DealState,
  type DealStore,
  type EvidencePack,
  type ItemCard,
  type Message,
  type MessageChannel,
  type Party,
  type PaymentRecord,
  type Shipment,
  type Verdict,
} from "@pay-pals/contracts";
import { nowIso } from "../time";
import { newId } from "./ids";

export interface DealRecord {
  deal: Deal;
  cards: ItemCard[];
  messages: Message[];
  verdicts: Verdict[];
  arrival: ArrivalCheck | null;
  payment: PaymentRecord | null;
  shipment: Shipment | null;
  evidence: EvidencePack | null;
  events: DealEvent[];
}

export function emptyRecord(deal: Deal): DealRecord {
  return { deal, cards: [], messages: [], verdicts: [], arrival: null, payment: null, shipment: null, evidence: null, events: [] };
}

export class MemoryDealStore implements DealStore {
  private readonly records = new Map<string, DealRecord>();

  /** Load a complete record, for example a finished fixture deal. */
  importDeal(record: DealRecord): void {
    this.records.set(record.deal.id, record);
  }

  private must(dealId: string): DealRecord {
    const rec = this.records.get(dealId);
    if (!rec) throw new Error(`Deal not found: ${dealId}`);
    return rec;
  }

  async createDeal(input: CreateDealInput): Promise<Deal> {
    const at = nowIso();
    const deal: Deal = {
      id: newId(),
      state: "DRAFT",
      scenario: input.scenario ?? null,
      seller: input.seller,
      buyer: input.buyer ?? null,
      currentCardVersion: 0,
      lockedCardVersion: null,
      createdAt: at,
      updatedAt: at,
    };
    this.records.set(deal.id, emptyRecord(deal));
    return deal;
  }

  async getDeal(dealId: string): Promise<Deal | null> {
    return this.records.get(dealId)?.deal ?? null;
  }

  async setBuyer(dealId: string, buyer: Party): Promise<Deal> {
    const rec = this.must(dealId);
    rec.deal = { ...rec.deal, buyer, updatedAt: nowIso() };
    return rec.deal;
  }

  async transition(dealId: string, to: DealState, actor: DealEvent["actor"], summary: string): Promise<Deal> {
    const rec = this.must(dealId);
    const from = rec.deal.state;
    assertTransition(from, to);
    const at = nowIso();
    rec.deal = { ...rec.deal, state: to, updatedAt: at };
    rec.events.push({ id: newId(), dealId, kind: "state_changed", actor, summary, fromState: from, toState: to, at });
    return rec.deal;
  }

  async saveCard(card: ItemCard): Promise<ItemCard> {
    const rec = this.must(card.dealId);
    if (rec.deal.lockedCardVersion !== null) throw new Error("The item card is locked and cannot change.");
    if (rec.cards.some((c) => c.version === card.version)) throw new Error(`Card version ${card.version} already exists.`);
    rec.cards.push(card);
    rec.deal = { ...rec.deal, currentCardVersion: card.version, updatedAt: nowIso() };
    return card;
  }

  async getCard(dealId: string, version: number): Promise<ItemCard | null> {
    return this.must(dealId).cards.find((c) => c.version === version) ?? null;
  }

  async getCurrentCard(dealId: string): Promise<ItemCard | null> {
    const rec = this.must(dealId);
    return rec.cards.find((c) => c.version === rec.deal.currentCardVersion) ?? null;
  }

  async listCards(dealId: string): Promise<ItemCard[]> {
    return [...this.must(dealId).cards].sort((a, b) => a.version - b.version);
  }

  async lockCard(dealId: string, version: number): Promise<ItemCard> {
    const rec = this.must(dealId);
    if (rec.deal.lockedCardVersion !== null) throw new Error("The item card is already locked.");
    const index = rec.cards.findIndex((c) => c.version === version);
    const card = rec.cards[index];
    if (!card) throw new Error(`Card version ${version} not found.`);
    const locked = { ...card, lockedAt: nowIso() };
    rec.cards[index] = locked;
    rec.deal = { ...rec.deal, lockedCardVersion: version, updatedAt: nowIso() };
    return locked;
  }

  async addMessage(message: Omit<Message, "id">): Promise<Message> {
    const rec = this.must(message.dealId);
    const saved: Message = { ...message, id: newId() };
    rec.messages.push(saved);
    return saved;
  }

  async listMessages(dealId: string, channel?: MessageChannel): Promise<Message[]> {
    const all = this.must(dealId).messages;
    return channel ? all.filter((m) => m.channel === channel) : [...all];
  }

  async saveVerdict(verdict: Verdict): Promise<Verdict> {
    this.must(verdict.dealId).verdicts.push(verdict);
    return verdict;
  }

  async listVerdicts(dealId: string): Promise<Verdict[]> {
    return [...this.must(dealId).verdicts];
  }

  async saveArrivalCheck(check: ArrivalCheck): Promise<ArrivalCheck> {
    this.must(check.dealId).arrival = check;
    return check;
  }

  async getArrivalCheck(dealId: string): Promise<ArrivalCheck | null> {
    return this.must(dealId).arrival;
  }

  async savePayment(payment: PaymentRecord): Promise<PaymentRecord> {
    this.must(payment.dealId).payment = payment;
    return payment;
  }

  async getPayment(dealId: string): Promise<PaymentRecord | null> {
    return this.must(dealId).payment;
  }

  async getPaymentByOrderId(paypalOrderId: string): Promise<PaymentRecord | null> {
    for (const rec of this.records.values()) {
      if (rec.payment?.paypalOrderId === paypalOrderId) return rec.payment;
    }
    return null;
  }

  async saveShipment(shipment: Shipment): Promise<Shipment> {
    this.must(shipment.dealId).shipment = shipment;
    return shipment;
  }

  async getShipment(dealId: string): Promise<Shipment | null> {
    return this.must(dealId).shipment;
  }

  async saveEvidence(pack: EvidencePack): Promise<EvidencePack> {
    this.must(pack.dealId).evidence = pack;
    return pack;
  }

  async getEvidence(dealId: string): Promise<EvidencePack | null> {
    return this.must(dealId).evidence;
  }

  async appendEvent(event: Omit<DealEvent, "id">): Promise<DealEvent> {
    const rec = this.must(event.dealId);
    const saved: DealEvent = { ...event, id: newId() };
    rec.events.push(saved);
    return saved;
  }

  async listEvents(dealId: string): Promise<DealEvent[]> {
    return [...this.must(dealId).events].sort((a, b) => a.at.localeCompare(b.at));
  }
}

export function createMemoryDealStore(): MemoryDealStore {
  return new MemoryDealStore();
}
