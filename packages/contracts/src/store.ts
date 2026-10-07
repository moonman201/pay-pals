/**
 * Interface packages/db implements. apps/web reads and writes deals only
 * through this. Builders mock it in tests.
 */
import type { Deal, Party, ScenarioId } from "./deal";
import type { DealState } from "./deal-state";
import type { ItemCard } from "./item-card";
import type { DealEvent, Message, MessageChannel } from "./messages";
import type { PaymentRecord } from "./payment";
import type { Shipment } from "./shipping";
import type { ArrivalCheck, Verdict } from "./verdict";
import type { EvidencePack } from "./evidence";

export interface CreateDealInput {
  seller: Party;
  buyer?: Party | null;
  scenario?: ScenarioId | null;
}

export interface DealStore {
  createDeal(input: CreateDealInput): Promise<Deal>;
  getDeal(dealId: string): Promise<Deal | null>;
  /**
   * Deals matching a scenario and, optionally, a set of states, oldest first.
   * Used by the demo seed to find out what already exists on a durable store.
   */
  findDeals(query: { scenario?: ScenarioId | null; states?: readonly DealState[] }): Promise<Deal[]>;
  setBuyer(dealId: string, buyer: Party): Promise<Deal>;
  /**
   * Move the deal to a new state. Rejects with IllegalTransitionError when the
   * move is not in DEAL_TRANSITIONS. Appends a state_changed event.
   */
  transition(dealId: string, to: DealState, actor: DealEvent["actor"], summary: string): Promise<Deal>;

  /**
   * Save a new card version. Rejects if the deal's card is locked or the deal
   * is past REVIEWED. Clears buyerAgreedAt and sellerAgreedAt.
   */
  saveCard(card: ItemCard): Promise<ItemCard>;
  /**
   * Record one side's agreement to the current card version. Allowed in
   * LISTED and REVIEWED. Idempotent for the same side. Does not lock or
   * transition; apps/web locks and moves to AGREED when both sides have agreed.
   */
  recordAgreement(dealId: string, role: "buyer" | "seller", at?: string): Promise<Deal>;
  getCard(dealId: string, version: number): Promise<ItemCard | null>;
  getCurrentCard(dealId: string): Promise<ItemCard | null>;
  listCards(dealId: string): Promise<ItemCard[]>;
  /** Lock the current version. Called once, at AGREED. */
  lockCard(dealId: string, version: number): Promise<ItemCard>;

  addMessage(message: Omit<Message, "id">): Promise<Message>;
  listMessages(dealId: string, channel?: MessageChannel): Promise<Message[]>;

  saveVerdict(verdict: Verdict): Promise<Verdict>;
  listVerdicts(dealId: string): Promise<Verdict[]>;
  saveArrivalCheck(check: ArrivalCheck): Promise<ArrivalCheck>;
  getArrivalCheck(dealId: string): Promise<ArrivalCheck | null>;

  savePayment(payment: PaymentRecord): Promise<PaymentRecord>;
  getPayment(dealId: string): Promise<PaymentRecord | null>;
  getPaymentByOrderId(paypalOrderId: string): Promise<PaymentRecord | null>;

  saveShipment(shipment: Shipment): Promise<Shipment>;
  getShipment(dealId: string): Promise<Shipment | null>;

  saveEvidence(pack: EvidencePack): Promise<EvidencePack>;
  getEvidence(dealId: string): Promise<EvidencePack | null>;

  appendEvent(event: Omit<DealEvent, "id">): Promise<DealEvent>;
  listEvents(dealId: string): Promise<DealEvent[]>;
}

/**
 * Idempotency for PayPal webhooks, one receipt per PayPal event id. The
 * handler claims the id first, does its work, and releases the claim if the
 * work failed so PayPal's retry is processed.
 */
export interface WebhookReceiptStore {
  hasWebhookReceipt(eventId: string): Promise<boolean>;
  /** Claims the event id. Returns false when it was already claimed. */
  recordWebhookReceipt(eventId: string, eventType: string): Promise<boolean>;
  /** Drops a claim so the event can be handled again. */
  releaseWebhookReceipt(eventId: string): Promise<void>;
}

/** What packages/db returns: deals plus webhook receipts. */
export type PayPalsStore = DealStore & WebhookReceiptStore;
