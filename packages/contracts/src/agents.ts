/**
 * Interfaces packages/agents implements. apps/web calls only these.
 * Every result carries a short pal message for the chat pane.
 */
import type { ArrivalCheck, CertRecord, PriceCheck, Verdict } from "./verdict";
import type { CardField, ItemCard, Photo } from "./item-card";
import type { DealEvent, Message } from "./messages";
import type { ChecklistItem, Shipment } from "./shipping";
import type { RedFlag } from "./red-flag";
import type { Deal, Party } from "./deal";
import type { EvidencePack } from "./evidence";
import type { PaymentRecord } from "./payment";
import type { Shipment } from "./shipping";

/** Typed data plus one plain message for the UI. */
export interface PalResult<T> {
  data: T;
  palMessage: string;
}

export interface BuildCardInput {
  dealId: string;
  listingText: string;
  photos: Photo[];
  sellerNotes: string;
  sellerPaypalEmail: string;
  /** Price the seller typed, when the listing text does not name one. */
  askingPrice?: number;
}

/** What the Buyer Pal knows about the deal beyond the card and the chat. */
export interface ReviewContext {
  /** The deal id, needed when the review runs with no card (a refusal reviewed from the chat alone). */
  dealId?: string;
  /** The seller as the deal knows them, so the NAME_MISMATCH rule can compare against the PayPal email. */
  seller?: Pick<Party, "displayName" | "email"> | null;
  /** The listing the buyer pasted, when the deal was buyer-started. */
  listingUrl?: string | null;
  /** True once the seller opened the invite. False with a buyer-started deal means the seller has not joined. */
  sellerJoined?: boolean;
  /** True when the seller declined the invite (recorded by the buyer or the seller). Raises INVITE_REFUSED. */
  inviteDeclined?: boolean;
}

export interface BuyerRequest {
  /** Which part of the card the buyer wants changed or added. */
  field: CardField;
  /** What the buyer asked for, in their words. */
  request: string;
}

export interface SellerPal {
  /** Turn a pasted listing and photos into a draft card (version 1). Reads serial and model from photos. */
  buildCard(input: BuildCardInput): Promise<PalResult<ItemCard>>;
  /** Apply a buyer's request and the seller's reply. Returns a new card version. Never edits a locked card. */
  applyRequest(
    card: ItemCard,
    buyerRequest: BuyerRequest,
    sellerReply: string,
    newPhotos?: Photo[],
  ): Promise<PalResult<ItemCard>>;
  /** Packing and shipping steps for the locked card. */
  shipmentChecklist(deal: Deal, lockedCard: ItemCard): Promise<PalResult<ChecklistItem[]>>;
}

export interface BuyerPal {
  /**
   * Review the card and the shared chat before money moves.
   * Deterministic rules run first. The model may add flags and wording but
   * never removes or downgrades a flag a rule raised.
   */
  review(card: ItemCard | null, chatTranscript: Message[], context?: ReviewContext): Promise<PalResult<Verdict>>;
  /**
   * Check a shipment at ship time: required checklist items not done and
   * packing photos missing raise MISSING_PACKING_PHOTO (caution). Deterministic.
   */
  checkShipment(lockedCard: ItemCard, shipment: Shipment): Promise<PalResult<RedFlag[]>>;
  /** Compare what arrived against the locked card. */
  checkArrival(lockedCard: ItemCard, arrivalPhotos: Photo[]): Promise<PalResult<ArrivalCheck>>;
}

/** Everything the pack builder needs. apps/web gathers it from the store. */
export interface EvidenceInput {
  deal: Deal;
  lockedCard: ItemCard;
  verdicts: Verdict[];
  arrivalCheck: ArrivalCheck | null;
  messages: Message[];
  payment: PaymentRecord | null;
  shipment: Shipment | null;
  timeline: DealEvent[];
  /** Photos the buyer took on arrival. apps/web passes them; the pack includes them. */
  arrivalPhotos?: Photo[];
  requestedBy: "buyer" | "seller";
}

export type EvidencePackBuilder = (input: EvidenceInput) => Promise<PalResult<EvidencePack>>;

/** Grading certificate lookup. PSA's public API in production, fixture data in demos and tests. */
export interface CertLookup {
  lookup(certNumber: string): Promise<CertRecord>;
}

/** Market price lookup. Channel3 in production, fixture data in demos and tests. */
export interface MarketPriceLookup {
  priceRange(query: { brand: string; model: string; condition: string }): Promise<PriceCheck>;
}
