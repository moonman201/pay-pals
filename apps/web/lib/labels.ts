/** Plain words for the enums the contracts use. */
import type { Actor, Deal, DealEventKind, DealState, VerdictOverall } from "@pay-pals/contracts";

export const STATE_LABELS: Readonly<Record<DealState, string>> = {
  DRAFT: "Draft",
  INVITED: "Waiting for the seller",
  LISTED: "Listed",
  REVIEWED: "Reviewed",
  AGREED: "Agreed, card locked",
  PAYMENT_PENDING: "Payment pending",
  PAID: "Paid",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  COMPLETE: "Complete",
  BLOCKED: "Blocked",
  ISSUE: "Issue open",
  CANCELLED: "Cancelled",
};

/** Short label for an event kind, for the timeline and the evidence pack. */
export const EVENT_KIND_LABELS: Readonly<Record<DealEventKind, string>> = {
  deal_created: "Deal started",
  seller_invited: "Seller invited",
  seller_joined: "Seller joined",
  invite_declined: "Invite declined",
  card_updated: "Card updated",
  review_posted: "Buyer Pal review",
  agreed: "Agreed",
  card_locked: "Card locked",
  state_changed: "State changed",
  off_platform_chosen: "Paying another way",
  payment_created: "PayPal order created",
  payment_captured: "Payment captured",
  shipped: "Shipped",
  shipment_checked: "Buyer Pal shipment check",
  delivered: "Delivered",
  arrival_checked: "Buyer Pal arrival check",
  evidence_built: "Evidence pack built",
  dispute_opened: "Dispute opened",
};

export const OVERALL_LABELS: Readonly<Record<VerdictOverall, string>> = {
  go: "Go",
  caution: "Caution",
  stop: "Stop",
};

export function actorLabel(actor: Actor, deal: Deal): string {
  switch (actor) {
    case "buyer":
      return deal.buyer?.displayName ?? "Buyer";
    case "seller":
      return deal.seller.displayName;
    case "buyer_pal":
      return "Buyer Pal";
    case "seller_pal":
      return "Seller Pal";
    case "paypal":
      return "PayPal";
    case "system":
      return "Pay Pals";
  }
}
