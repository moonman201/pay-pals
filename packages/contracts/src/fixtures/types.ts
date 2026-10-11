/**
 * Shape of a demo scenario fixture. Every lane builds against these on day
 * one: agents test their verdicts, web renders the deal room, qa drives e2e.
 */
import type { Deal, Party, ScenarioId } from "../deal";
import type { ItemCard, Photo } from "../item-card";
import type { DealEvent, Message } from "../messages";
import type { RedFlagCode } from "../red-flag";
import type { Shipment } from "../shipping";
import type { ArrivalOutcome, CertRecord, MismatchField, PriceCheck, VerdictOverall } from "../verdict";
import type { PaymentRecord } from "../payment";

export interface ExpectedVerdict {
  overall: VerdictOverall;
  /** The Buyer Pal must raise every one of these. */
  requiredFlags: RedFlagCode[];
  /** It may raise these too. */
  optionalFlags: RedFlagCode[];
  /** It must raise no flag at this severity. */
  forbiddenSeverity: "stop" | null;
}

export interface ExpectedArrival {
  /** match, mismatch or inconclusive. Tracks ArrivalCheck.outcome. */
  outcome: ArrivalOutcome;
  /** Every field listed here must appear in mismatches. */
  mismatchFields: MismatchField[];
}

export interface ScenarioFixture {
  id: ScenarioId;
  name: string;
  /** One or two sentences for the demo picker. */
  summary: string;
  deal: Deal;
  seller: Party;
  buyer: Party;
  /** What the seller pasted and uploaded to start the deal. */
  listingText: string;
  sellerNotes: string;
  listingPhotos: Photo[];
  /** Card versions in order. The last one is what both sides see at review time. */
  cards: ItemCard[];
  /** Shared chat between buyer and seller, in order, up to the review. */
  chat: Message[];
  /** Canned market price answer so tests never spend Channel3 credits. */
  marketPrice: PriceCheck;
  /** Canned grader answer for the card's certNumber, so tests never call PSA. Null when the item has no cert. */
  certRecord: CertRecord | null;
  expectedVerdict: ExpectedVerdict;
  /** Set for scenarios that reach payment and shipping. */
  payment: PaymentRecord | null;
  shipment: Shipment | null;
  arrivalPhotos: Photo[];
  expectedArrival: ExpectedArrival | null;
  /** The timeline as it stands at the end of the scenario, hash-chained, for the web mock. */
  timeline: DealEvent[];
}
